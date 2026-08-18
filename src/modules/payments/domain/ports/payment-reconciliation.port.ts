/**
 * Puerto de salida de repositorio de reconciliación de pagos (MSF-PAY-004).
 *
 * Busca pagos pendientes y actualiza estados basándose en la respuesta
 * del proveedor. ROP estricto: los adapters traducen errores técnicos
 * a DomainError en su límite (Master Spec §ROP / ADR-017).
 *
 * Este archivo NO importa NestJS, Prisma ni HTTP: es TypeScript puro.
 */

import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de entrada del caso de uso de reconciliación.
 */
export interface ReconcilePendingPaymentsUseCase {
  /**
   * Ejecuta un batch de reconciliación de pagos pendientes.
   * @param now - Fecha/hora actual (inyectable para tests deterministas).
   */
  execute(now: Date): Promise<Result<ReconcileBatchResult, DomainError>>;
}

/**
 * Resultado de un batch de reconciliación.
 */
export interface ReconcileBatchResult {
  /** Número de pagos seleccionados para reconciliar. */
  readonly selected: number;
  /** Número de pagos transicionados a estado terminal. */
  readonly reconciled: number;
  /** Número de pagos que permanecieron pendientes (provider no terminal). */
  readonly pending: number;
  /** Número de pagos expirados (>24h sin aprobación). */
  readonly expired: number;
}

/**
 * Resultado de búsqueda de pago pendiente para reconciliación.
 */
export interface PendingPaymentLookupResult {
  readonly id: string;
  readonly orderId: string;
  readonly cartId: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly status: string;
  readonly amountCop: bigint;
  readonly createdAt: Date;
}

/**
 * Puerto de repositorio para reconciliación (búsqueda y actualización).
 *
 * Los adapters Prisma implementan este puerto con SELECT FOR UPDATE
 * para exclusión mutua distribuida (Master Spec §95).
 */
export interface PaymentReconciliationRepositoryPort {
  /**
   * Busca pagos pendientes para reconciliación.
   * Pagos con status PENDING y created_at entre minAge y maxAge.
   * Usa FOR UPDATE SKIP LOCKED para exclusión mutua.
   */
  findPendingPayments(params: {
    now: Date;
    minAgeMs: number;
    maxAgeMs: number;
    limit: number;
  }): Promise<ReadonlyArray<PendingPaymentLookupResult>>;

  /**
   * Actualiza el estado de un pago y su orden asociada.
   * Transiciones idempotentes: solo aplica si el pago no es terminal.
   */
  transitionPaymentStatus(params: {
    paymentId: string;
    orderId: string;
    paymentStatus: 'APPROVED' | 'DECLINED' | 'EXPIRED';
    orderStatus:
      | 'PAID'
      | 'PAYMENT_FAILED'
      | 'PAYMENT_EXPIRED'
      | 'PAYMENT_REFUND_PENDING';
  }): Promise<void>;

  /**
   * Busca y bloquea reservas CHECKOUT_PENDING para un carrito.
   */
  findCheckoutPendingHolds(
    cartId: string,
  ): Promise<
    ReadonlyArray<{
      reservationId: string;
      productId: string;
      quantity: number;
    }>
  >;

  /**
   * Consume un hold CHECKOUT_PENDING y decrementa stock.
   * Lock SELECT FOR UPDATE por product_id ASC para evitar deadlocks.
   */
  consumeHold(params: {
    reservationId: string;
    productId: string;
    quantity: number;
  }): Promise<void>;

  /**
   * Crea un refund pendiente para un pago (idempotente).
   */
  createRefundPending(params: {
    paymentId: string;
    amountCop: bigint;
    idempotencyKey: string;
  }): Promise<string>;

  /**
   * Crea un evento de outbox.
   */
  writeOutboxEvent(params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
  }): Promise<void>;
}
