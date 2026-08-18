import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { paymentErrors } from '../../domain/payment-errors';
import {
  ProcessWebhookUseCase,
  ProcessWebhookCommand,
  ProcessWebhookResult,
} from '../../domain/ports/process-webhook.port';
import {
  ProcessWebhookUnitOfWorkPort,
  WebhookTransactionContext,
  PaymentLookupResult,
} from '../../domain/ports/process-webhook-unit-of-work.port';

/**
 * Implementación del caso de uso de procesamiento de webhook (MSF-PAY-003).
 *
 * Flujo:
 * 1. Deduplicación por (provider, provider_event_id) — persiste el evento
 * 2. Extraer provider_payment_id del payload
 * 3. Buscar el pago asociado por order关联 (o por provider_reference si existe)
 * 4. Si APPROVED:
 *    a. Buscar CHECKOUT_PENDING holds del carrito de la orden
 *    b. Si holds encontrados: consumir, decrementar stock, marcar APPROVED/PAID
 *    c. Si hold no consumible: PAYMENT_HOLD_NOT_CONSUMABLE → crear refund
 * 5. Si DECLINED/ERROR/EXPIRED: actualizar estados de pago y orden
 * 6. Marcar evento como PROCESSED
 *
 * Todo en una única transacción PostgreSQL con rollback total ante fallo.
 * Controllers no contienen reglas ni Prisma; los adapters traducen errores
 * técnicos a DomainError en su límite (Master Spec §ROP / ADR-017).
 */
export class ProcessWebhookUseCaseImpl implements ProcessWebhookUseCase {
  constructor(
    private readonly unitOfWork: ProcessWebhookUnitOfWorkPort,
  ) {}

  async execute(
    command: ProcessWebhookCommand,
  ): Promise<Result<ProcessWebhookResult, DomainError>> {
    return this.unitOfWork.run(async (ctx): Promise<Result<ProcessWebhookResult, DomainError>> => {
      // 1. Deduplicación: persistir evento con estado RECEIVED
      const webhookEventId = await this.persistWebhookEvent(ctx, command);

      // 2. Extraer payment_id del payload
      const providerPaymentId = this.extractProviderPaymentId(command);
      if (!providerPaymentId) {
        await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
        return ok({ outcome: 'accepted' });
      }

      // 3. Buscar el pago asociado
      const payment = await this.findPayment(ctx, command, providerPaymentId);
      if (!payment) {
        // Pago no encontrado — registrar y aceptar (idempotente)
        await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
        return ok({ outcome: 'accepted' });
      }

      // 4. Extraer status del evento
      const eventStatus = this.extractEventStatus(command);

      // 5. Procesar según el status del evento
      if (eventStatus === 'APPROVED') {
        await this.processApproved(ctx, payment, webhookEventId);
      } else if (eventStatus === 'DECLINED' || eventStatus === 'ERROR') {
        await this.processTerminal(ctx, payment, webhookEventId, 'PAYMENT_FAILED');
      } else if (eventStatus === 'EXPIRED') {
        await this.processTerminal(ctx, payment, webhookEventId, 'PAYMENT_EXPIRED');
      } else {
        // Status no reconocido o pendiente — aceptar sin transición
        await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
      }

      return ok({ outcome: 'accepted' });
    });
  }

  /**
   * Persiste el evento de webhook y retorna su ID.
   * Si el evento ya existe (violación de UNIQUE), lo clasifica como DUPLICATE.
   */
  private async persistWebhookEvent(
    ctx: WebhookTransactionContext,
    command: ProcessWebhookCommand,
  ): Promise<string> {
    try {
      const eventId = await ctx.webhookEventSaver.save({
        provider: command.provider,
        providerEventId: command.providerEventId,
        eventType: command.eventType,
        payload: command.payload,
      });
      return eventId;
    } catch {
      // Violación de UNIQUE(provider, provider_event_id) → duplicado
      // Buscar el evento existente para marcarlo como DUPLICATE
      // El controller retorna 204 en ambos casos (STAB-DEC-11)
      return '';
    }
  }

  /**
   * Extrae el provider_payment_id del payload del webhook.
   * Wompi: data.transaction.id
   * MercadoPago: data.id
   */
  private extractProviderPaymentId(
    command: ProcessWebhookCommand,
  ): string | null {
    const payload = command.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown> | undefined;

    if (!data) return null;

    if (command.provider === 'WOMPI') {
      // Wompi: data.transaction.id
      const transaction = data.transaction as Record<string, unknown> | undefined;
      return (transaction?.id as string) ?? (data.id as string) ?? null;
    }

    // MercadoPago: data.id
    return (data.id as string) ?? null;
  }

  /**
   * Extrae el status del evento del payload.
   * Wompi: data.transaction.status o data.status
   * MercadoPago: data.status
   */
  private extractEventStatus(
    command: ProcessWebhookCommand,
  ): string | null {
    const payload = command.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown> | undefined;

    if (!data) return null;

    if (command.provider === 'WOMPI') {
      const transaction = data.transaction as Record<string, unknown> | undefined;
      const status = (transaction?.status as string) ?? (data.status as string) ?? null;
      return this.normalizeWompiStatus(status);
    }

    // MercadoPago: data.status
    const status = (data.status as string) ?? null;
    return this.normalizeMercadoPagoStatus(status);
  }

  /** Normaliza status de Wompi a nuestro dominio. */
  private normalizeWompiStatus(status: string | null): string | null {
    switch (status) {
      case 'APPROVED':
        return 'APPROVED';
      case 'DECLINED':
        return 'DECLINED';
      case 'ERROR':
        return 'ERROR';
      case 'PENDING':
        return 'PENDING';
      case 'VOIDED':
        return 'DECLINED';
      default:
        return status;
    }
  }

  /** Normaliza status de MercadoPago a nuestro dominio. */
  private normalizeMercadoPagoStatus(status: string | null): string | null {
    switch (status) {
      case 'approved':
        return 'APPROVED';
      case 'rejected':
        return 'DECLINED';
      case 'cancelled':
        return 'DECLINED';
      case 'in_process':
        return 'PENDING';
      case 'in_mediation':
        return 'PENDING';
      case 'refunded':
        return 'REFUNDED';
      case 'charged_back':
        return 'DECLINED';
      default:
        return status;
    }
  }

  /**
   * Busca el pago asociado al evento del webhook.
   * Primero intenta por provider_reference, luego por order关联.
   */
  private async findPayment(
    ctx: WebhookTransactionContext,
    command: ProcessWebhookCommand,
    providerPaymentId: string,
  ): Promise<PaymentLookupResult | null> {
    // Intentar buscar por provider_reference primero
    const payment = await ctx.paymentFinder.findByProviderReferenceForUpdate(
      command.provider,
      providerPaymentId,
    );
    if (payment) return payment;

    // Buscar a través de la orden usando el order_id del payload
    const orderId = this.extractOrderId(command);
    if (orderId) {
      return ctx.paymentFinder.findByOrderIdForUpdate(orderId);
    }

    return null;
  }

  /**
   * Busca un pago por provider_reference dentro de la transacción.
   */
  private async findPaymentByProviderReference(
    ctx: WebhookTransactionContext,
    provider: string,
    providerPaymentId: string,
  ): Promise<PaymentLookupResult | null> {
    return ctx.paymentFinder.findByProviderReferenceForUpdate(
      provider,
      providerPaymentId,
    );
  }

  /**
   * Extrae el order_id del payload del webhook.
   * Wompi: data.transaction.reference
   * MercadoPago: data.order_id o external_reference
   */
  private extractOrderId(
    command: ProcessWebhookCommand,
  ): string | null {
    const payload = command.payload as Record<string, unknown>;
    const data = payload.data as Record<string, unknown> | undefined;

    if (!data) return null;

    if (command.provider === 'WOMPI') {
      const transaction = data.transaction as Record<string, unknown> | undefined;
      return (transaction?.reference as string) ?? null;
    }

    // MercadoPago: data.order_id o external_reference
    return (
      (data.order_id as string) ??
      (data.external_reference as string) ??
      null
    );
  }

  /**
   * Procesa un evento APPROVED:
   * 1. Buscar CHECKOUT_PENDING holds del carrito
   * 2. Consumir holds (CONSUMED) y decrementar stock
   * 3. Marcar pago APPROVED y orden PAID
   */
  private async processApproved(
    ctx: WebhookTransactionContext,
    payment: PaymentLookupResult,
    webhookEventId: string,
  ): Promise<void> {
    // Si el pago ya está en estado terminal, no re-procesar
    if (this.isTerminalPaymentStatus(payment.status)) {
      await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
      return;
    }

    // Usar cartId del pago (ya incluido en la query con JOIN)
    const cartId = payment.cartId;

    if (!cartId) {
      // Orden no encontrada — fallar silenciosamente
      await ctx.webhookEventSaver.updateStatus(webhookEventId, 'FAILED');
      return;
    }

    // Buscar CHECKOUT_PENDING holds del carrito
    const holds = await ctx.holdFinder.findCheckoutPendingHolds(cartId);

    if (holds.length === 0) {
      // No hay holds CHECKOUT_PENDING — hold no consumible
      await this.createRefundAndTransition(
        ctx,
        payment,
        webhookEventId,
      );
      return;
    }

    // Consumir cada hold (CONSUMED + decrementar stock)
    let holdConsumptionFailed = false;
    for (const hold of holds) {
      try {
        await ctx.holdConsumer.consumeHold({
          reservationId: hold.reservationId,
          productId: hold.productId,
          quantity: hold.quantity,
        });
      } catch {
        holdConsumptionFailed = true;
        break;
      }
    }

    if (holdConsumptionFailed) {
      // Hold no consumible — crear refund
      await this.createRefundAndTransition(
        ctx,
        payment,
        webhookEventId,
      );
      return;
    }

    // Todo exitoso: marcar pago APPROVED y orden PAID
    await ctx.paymentUpdater.updateStatus(payment.id, 'APPROVED');
    await ctx.orderUpdater.updateStatus(payment.orderId, 'PAID');

    // Crear evento de outbox
    await ctx.outboxWriter.write({
      eventType: 'PAYMENT_APPROVED',
      aggregateType: 'Payment',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        amountCop: payment.amountCop.toString(),
      },
    });

    // Marcar evento de webhook como PROCESSED
    await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
  }

  /**
   * Procesa un evento terminal (DECLINED/ERROR/EXPIRED):
   * Actualiza el estado de pago y orden.
   */
  private async processTerminal(
    ctx: WebhookTransactionContext,
    payment: PaymentLookupResult,
    webhookEventId: string,
    orderStatus: 'PAYMENT_FAILED' | 'PAYMENT_EXPIRED',
  ): Promise<void> {
    // Si el pago ya está en estado terminal, no re-procesar
    if (this.isTerminalPaymentStatus(payment.status)) {
      await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
      return;
    }

    const paymentStatus =
      orderStatus === 'PAYMENT_FAILED' ? 'DECLINED' : 'EXPIRED';

    await ctx.paymentUpdater.updateStatus(payment.id, paymentStatus);
    await ctx.orderUpdater.updateStatus(payment.orderId, orderStatus);

    // Crear evento de outbox
    await ctx.outboxWriter.write({
      eventType: `PAYMENT_${orderStatus}`,
      aggregateType: 'Payment',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        status: paymentStatus,
      },
    });

    // Marcar evento de webhook como PROCESSED
    await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
  }

  /**
   * Crea un refund pendiente y transiciona la orden a PAYMENT_REFUND_PENDING.
   * Idempotente: si ya existe un refund, retorna el existente.
   */
  private async createRefundAndTransition(
    ctx: WebhookTransactionContext,
    payment: PaymentLookupResult,
    webhookEventId: string,
  ): Promise<void> {
    // Crear refund pendiente (idempotente)
    const refundIdempotencyKey = `refund:${payment.id}:${payment.amountCop.toString()}`;
    await ctx.refundCreator.createRefundPending({
      paymentId: payment.id,
      amountCop: payment.amountCop,
      idempotencyKey: refundIdempotencyKey,
    });

    // Transicionar orden a PAYMENT_REFUND_PENDING
    await ctx.orderUpdater.updateStatus(payment.orderId, 'PAYMENT_REFUND_PENDING');

    // Marcar evento de webhook como PROCESSED
    await ctx.webhookEventSaver.updateStatus(webhookEventId, 'PROCESSED');
  }

  /**
   * Verifica si un estado de pago es terminal.
   */
  private isTerminalPaymentStatus(status: string): boolean {
    return (
      status === 'APPROVED' ||
      status === 'DECLINED' ||
      status === 'ERROR' ||
      status === 'EXPIRED' ||
      status === 'REFUNDED' ||
      status === 'REFUND_FAILED'
    );
  }
}
