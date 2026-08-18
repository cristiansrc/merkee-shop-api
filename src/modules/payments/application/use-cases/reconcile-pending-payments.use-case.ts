import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { paymentErrors } from '../../domain/payment-errors';
import {
  ReconcilePendingPaymentsUseCase,
  ReconcileBatchResult,
  PendingPaymentLookupResult,
  PaymentReconciliationRepositoryPort,
} from '../../domain/ports/payment-reconciliation.port';
import { PaymentProviderPort } from '../../domain/ports/payment-provider.port';
import { PaymentProviderSelector } from '../../domain/ports/payment-provider-selector';
import {
  RECONCILIATION_MIN_AGE_MS,
  RECONCILIATION_MAX_AGE_MS,
  RECONCILIATION_BATCH_SIZE,
} from '../../domain/ports/payment-reconciliation.config';

/**
 * Implementación del caso de uso de reconciliación de pagos pendientes (MSF-PAY-004).
 *
 * Flujo:
 * 1. Buscar pagos PENDING en la ventana [5min, 24h] con FOR UPDATE SKIP LOCKED
 * 2. Para cada pago, consultar el proveedor Strategy por su estado actual
 * 3. Si el proveedor devuelve APPROVED:
 *    a. Buscar CHECKOUT_PENDING holds del carrito
 *    b. Si holds encontrados: consumir, decrementar stock → APPROVED/PAID
 *    c. Si hold no consumible: refund automático sin descuento → PAYMENT_REFUND_PENDING
 * 4. Si el proveedor devuelve DECLINED/ERROR → PAYMENT_FAILED
 * 5. Si el proveedor devuelve EXPIRED o el pago tiene >24h: PAYMENT_EXPIRED
 *    y liberar CHECKOUT_PENDING
 * 6. Si el proveedor sigue en PENDING: no transicionar
 *
 * Transiciones idempotentes: solo aplica si el pago no es terminal.
 * Controllers no contienen reglas ni Prisma; los adapters traducen errores
 * técnicos a DomainError en su límite (Master Spec §ROP / ADR-017).
 *
 * REGLA: no registrar payload sensible del proveedor; solo status y IDs internos.
 */
export class ReconcilePendingPaymentsUseCaseImpl
  implements ReconcilePendingPaymentsUseCase
{
  constructor(
    private readonly repository: PaymentReconciliationRepositoryPort,
    private readonly providerSelector: PaymentProviderSelector,
  ) {}

  async execute(
    now: Date,
  ): Promise<Result<ReconcileBatchResult, DomainError>> {
    try {
      // 1. Buscar pagos pendientes en la ventana [5min, 24h]
      const pendingPayments = await this.repository.findPendingPayments({
        now,
        minAgeMs: RECONCILIATION_MIN_AGE_MS,
        maxAgeMs: RECONCILIATION_MAX_AGE_MS,
        limit: RECONCILIATION_BATCH_SIZE,
      });

      if (pendingPayments.length === 0) {
        return ok({
          selected: 0,
          reconciled: 0,
          pending: 0,
          expired: 0,
        });
      }

      let reconciled = 0;
      let pending = 0;
      let expired = 0;

      // 2. Procesar cada pago pendiente
      for (const payment of pendingPayments) {
        const result = await this.reconcilePayment(payment, now);
        switch (result) {
          case 'reconciled':
            reconciled++;
            break;
          case 'pending':
            pending++;
            break;
          case 'expired':
            expired++;
            break;
        }
      }

      return ok({
        selected: pendingPayments.length,
        reconciled,
        pending,
        expired,
      });
    } catch (error: unknown) {
      // Error técnico no clasificable en la selección del batch
      return fail(paymentErrors.technicalFailure());
    }
  }

  /**
   * Reconcilia un único pago pendiente.
   * Retorna el resultado de la reconciliación.
   */
  private async reconcilePayment(
    payment: PendingPaymentLookupResult,
    now: Date,
  ): Promise<'reconciled' | 'pending' | 'expired'> {
    // Verificar si el pago excedió la ventana de 24 horas
    const ageMs = now.getTime() - payment.createdAt.getTime();
    if (ageMs > RECONCILIATION_MAX_AGE_MS) {
      await this.expirePayment(payment);
      return 'expired';
    }

    // Consultar el proveedor por el estado actual
    const providerStatus = await this.queryProviderStatus(payment);

    if (providerStatus === null) {
      // Error de consulta al proveedor — mantener pendiente
      return 'pending';
    }

    // Aplicar transiciones idempotentes según el estado del proveedor
    if (providerStatus === 'APPROVED') {
      await this.processApprovedReconciliation(payment);
      return 'reconciled';
    }

    if (
      providerStatus === 'DECLINED' ||
      providerStatus === 'ERROR' ||
      providerStatus === 'EXPIRED'
    ) {
      await this.processTerminalReconciliation(payment, providerStatus);
      return 'reconciled';
    }

    // Provider sigue en PENDING — no transicionar
    return 'pending';
  }

  /**
   * Consulta el estado del pago en el proveedor Strategy.
   * Retorna null si hay error técnico (no clasificable).
   *
   * Delega al puerto PaymentProviderPort.queryPaymentStatus()
   * vía el selector de estrategias inyectado.
   *
   * REGLA: no registrar payload sensible del proveedor; solo status.
   */
  private async queryProviderStatus(
    payment: PendingPaymentLookupResult,
  ): Promise<'APPROVED' | 'DECLINED' | 'ERROR' | 'EXPIRED' | 'PENDING' | null> {
    try {
      if (!payment.providerReference) {
        // Sin referencia del proveedor — no se puede consultar
        return null;
      }

      const strategy = this.providerSelector.resolve(
        payment.provider as 'WOMPI' | 'MERCADO_PAGO',
      );

      const result = await strategy.queryPaymentStatus(payment.providerReference);
      return result.status;
    } catch {
      // Error técnico al consultar proveedor — no clasificable
      return null;
    }
  }

  /**
   * Procesa un pago APPROVED por reconciliación.
   * Mismo flujo que el webhook: consumir holds o crear refund.
   */
  private async processApprovedReconciliation(
    payment: PendingPaymentLookupResult,
  ): Promise<void> {
    // Buscar CHECKOUT_PENDING holds del carrito
    const holds = await this.repository.findCheckoutPendingHolds(
      payment.cartId,
    );

    if (holds.length === 0) {
      // No hay holds CHECKOUT_PENDING — hold no consumible
      await this.createRefundAndTransition(payment);
      return;
    }

    // Consumir cada hold (CONSUMED + decrementar stock)
    let holdConsumptionFailed = false;
    for (const hold of holds) {
      try {
        await this.repository.consumeHold({
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
      await this.createRefundAndTransition(payment);
      return;
    }

    // Todo exitoso: marcar pago APPROVED y orden PAID
    await this.repository.transitionPaymentStatus({
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus: 'APPROVED',
      orderStatus: 'PAID',
    });

    // Crear evento de outbox
    await this.repository.writeOutboxEvent({
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
  }

  /**
   * Procesa un pago terminal por reconciliación (DECLINED/ERROR/EXPIRED).
   */
  private async processTerminalReconciliation(
    payment: PendingPaymentLookupResult,
    providerStatus: 'DECLINED' | 'ERROR' | 'EXPIRED',
  ): Promise<void> {
    const orderStatus =
      providerStatus === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'PAYMENT_FAILED';
    const paymentStatus =
      providerStatus === 'EXPIRED' ? 'EXPIRED' : 'DECLINED';

    await this.repository.transitionPaymentStatus({
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus,
      orderStatus,
    });

    // Crear evento de outbox
    await this.repository.writeOutboxEvent({
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
  }

  /**
   * Expira un pago que excedió la ventana de 24 horas.
   * PAYMENT_EXPIRED y libera CHECKOUT_PENDING.
   */
  private async expirePayment(
    payment: PendingPaymentLookupResult,
  ): Promise<void> {
    await this.repository.transitionPaymentStatus({
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus: 'EXPIRED',
      orderStatus: 'PAYMENT_EXPIRED',
    });

    // Crear evento de outbox
    await this.repository.writeOutboxEvent({
      eventType: 'PAYMENT_EXPIRED',
      aggregateType: 'Payment',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        status: 'EXPIRED',
      },
    });
  }

  /**
   * Crea un refund pendiente y transiciona la orden a PAYMENT_REFUND_PENDING.
   * Refund automático sin descuento si hold no consumible (ADR-005).
   * Idempotente: si ya existe un refund, retorna el existente.
   */
  private async createRefundAndTransition(
    payment: PendingPaymentLookupResult,
  ): Promise<void> {
    // Crear refund pendiente (idempotente)
    const refundIdempotencyKey = `refund:${payment.id}:${payment.amountCop.toString()}`;
    await this.repository.createRefundPending({
      paymentId: payment.id,
      amountCop: payment.amountCop,
      idempotencyKey: refundIdempotencyKey,
    });

    // Transicionar orden a PAYMENT_REFUND_PENDING
    await this.repository.transitionPaymentStatus({
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus: 'APPROVED', // Pago aprobado pero hold no consumible
      orderStatus: 'PAYMENT_REFUND_PENDING',
    });

    // Crear evento de outbox
    await this.repository.writeOutboxEvent({
      eventType: 'PAYMENT_REFUND_PENDING',
      aggregateType: 'Payment',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        reason: 'HOLD_NOT_CONSUMABLE',
      },
    });
  }
}
