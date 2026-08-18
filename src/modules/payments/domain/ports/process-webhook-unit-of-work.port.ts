/**
 * Puerto de unidad de trabajo para procesamiento de webhook de pago (MSF-PAY-003).
 *
 * Encapsula la transacción atómica que involucra:
 * 1. Persistir el evento de webhook (deduplicación)
 * 2. Buscar el pago asociado
 * 3. Buscar reservas CHECKOUT_PENDING equivalentes
 * 4. Consumir holds y decrementar stock (si APPROVED)
 * 5. Crear refund (si hold no consumible)
 * 6. Actualizar estados de pago y orden
 * 7. Crear evento de outbox
 *
 * Todo ocurre en una única frontera transaccional (Master Spec §91-95).
 */
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

export interface ProcessWebhookUnitOfWorkPort {
  /**
   * Ejecuta el procesamiento del webhook en una transacción atómica.
   * El callback recibe el contexto y debe retornar Result.
   * Si retorna Failure, la transacción se revierte.
   */
  run<T>(
    work: (ctx: WebhookTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>>;
}

/**
 * Contexto transaccional disponible dentro de la UoW de webhook.
 *
 * Cada puerto encapsula operaciones Prisma específicas dentro de la
 * misma transacción. El caso de usa NO conoce Prisma.
 */
export interface WebhookTransactionContext {
  /** Persiste el evento de webhook y retorna su ID. */
  readonly webhookEventSaver: WebhookEventSaverPort;

  /** Busca un pago por provider_reference o por order关联. */
  readonly paymentFinder: PaymentFinderPort;

  /** Busca y bloquea reservas CHECKOUT_PENDING para un carrito. */
  readonly holdFinder: HoldFinderPort;

  /** Consume holds CHECKOUT_PENDING y decrementa stock. */
  readonly holdConsumer: HoldConsumerPort;

  /** Crea un refund pendiente para un pago. */
  readonly refundCreator: RefundCreatorPort;

  /** Actualiza el estado de un pago. */
  readonly paymentUpdater: PaymentUpdaterPort;

  /** Actualiza el estado de una orden. */
  readonly orderUpdater: OrderUpdaterPort;

  /** Crea un evento de outbox. */
  readonly outboxWriter: OutboxWriterPort;
}

/** Puerto para persistir evento de webhook dentro de la transacción. */
export interface WebhookEventSaverPort {
  /**
   * Persiste un evento de webhook con estado RECEIVED.
   * Retorna el ID generado.
   */
  save(params: {
    provider: string;
    providerEventId: string;
    eventType: string | null;
    payload: unknown;
  }): Promise<string>;

  /**
   * Actualiza el estado de un evento de webhook.
   */
  updateStatus(
    eventId: string,
    status: 'PROCESSED' | 'DUPLICATE' | 'FAILED',
  ): Promise<void>;
}

/** Resultado de búsqueda de pago (incluye cartId para hold consumption). */
export interface PaymentLookupResult {
  readonly id: string;
  readonly orderId: string;
  readonly cartId: string;
  readonly provider: string;
  readonly status: string;
  readonly amountCop: bigint;
  readonly providerReference: string | null;
}

/** Puerto para buscar pagos dentro de la transacción. */
export interface PaymentFinderPort {
  /**
   * Busca un pago por ID dentro de la transacción.
   */
  findByIdForUpdate(paymentId: string): Promise<PaymentLookupResult | null>;

  /**
   * Busca un pago por order_id dentro de la transacción.
   */
  findByOrderIdForUpdate(orderId: string): Promise<PaymentLookupResult | null>;

  /**
   * Busca un pago por provider_reference dentro de la transacción.
   * El provider_reference es el ID del pago en el proveedor externo.
   */
  findByProviderReferenceForUpdate(
    provider: string,
    providerReference: string,
  ): Promise<PaymentLookupResult | null>;
}

/** Puerto para buscar CHECKOUT_PENDING holds dentro de la transacción. */
export interface HoldFinderPort {
  /**
   * Busca todas las reservas CHECKOUT_PENDING de un carrito.
   * Incluye el producto asociado para poder decrementar stock.
   */
  findCheckoutPendingHolds(cartId: string): Promise<ReadonlyArray<{
    reservationId: string;
    productId: string;
    quantity: number;
  }>>;
}

/** Puerto para consumir holds CHECKOUT_PENDING dentro de la transacción. */
export interface HoldConsumerPort {
  /**
   * Consume un hold CHECKOUT_PENDING: CONSUMED y decrementa stock.
   *
   * Lock SELECT FOR UPDATE por product_id ASC para evitar deadlocks.
   * Verifica stock_on_hand >= quantity antes de decrementar.
   *
   * @throws Error('PAYMENT_HOLD_NOT_CONSUMABLE') si el hold no es válido
   *         o stock insuficiente.
   */
  consumeHold(params: {
    reservationId: string;
    productId: string;
    quantity: number;
  }): Promise<void>;
}

/** Puerto para crear refunds dentro de la transacción. */
export interface RefundCreatorPort {
  /**
   * Crea un refund pendiente para un pago.
   * Idempotente: si ya existe un refund para el pago, retorna el existente.
   *
   * @returns ID del refund creado o existente.
   */
  createRefundPending(params: {
    paymentId: string;
    amountCop: bigint;
    idempotencyKey: string;
  }): Promise<string>;
}

/** Puerto para actualizar estado de pago dentro de la transacción. */
export interface PaymentUpdaterPort {
  /** Actualiza el estado de un pago. */
  updateStatus(
    paymentId: string,
    status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'EXPIRED',
  ): Promise<void>;
}

/** Puerto para actualizar estado de orden dentro de la transacción. */
export interface OrderUpdaterPort {
  /** Actualiza el estado de una orden. */
  updateStatus(
    orderId: string,
    status:
      | 'PAID'
      | 'PAYMENT_FAILED'
      | 'PAYMENT_EXPIRED'
      | 'PAYMENT_REFUND_PENDING'
      | 'PAYMENT_REFUNDED',
  ): Promise<void>;
}

/** Puerto para escribir eventos de outbox dentro de la transacción. */
export interface OutboxWriterPort {
  /** Crea un evento de outbox con estado PENDING. */
  write(params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
  }): Promise<void>;
}
