/**
 * Puerto de unidad de trabajo para operaciones atómicas de checkout.
 *
 * Encapsula la transacción que involucra:
 * 1. Validar reservas ACTIVE del carrito
 * 2. Convertir ACTIVE → CHECKOUT_PENDING
 * 3. Crear orden + pago pending
 * 4. Registrar idempotencia
 *
 * Todo ocurre en una única frontera transaccional (Master Spec §91-95).
 */
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartWithItemsRecord } from '../../../cart-reservation/domain/ports/cart-repository.port';

export interface CheckoutUnitOfWorkPort {
  /**
   * Ejecuta el checkout completo en una transacción atómica.
   * El callback recibe el contexto y debe retornar Result.
   * Si retorna Failure, la transacción se revierte.
   */
  run<T>(
    work: (ctx: CheckoutTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>>;
}

/** Contexto transaccional disponible dentro de la UoW de checkout. */
export interface CheckoutTransactionContext {
  /** Carrito con ítems y reservas precargados. */
  readonly cartWithItems: CartWithItemsRecord;

  /** Puerto de conversión de reservas ACTIVE → CHECKOUT_PENDING. */
  readonly reservationConverter: ReservationConverterPort;

  /** Puerto de creación de orden + pago. */
  readonly orderCreator: OrderCreatorPort;

  /** Puerto de registro de idempotencia. */
  readonly idempotency: CheckoutIdempotencyPort;
}

/** Puerto para convertir reservas ACTIVE → CHECKOUT_PENDING. */
export interface ReservationConverterPort {
  /** Convierte todas las reservas ACTIVE de un carrito a CHECKOUT_PENDING. */
  convertActiveToCheckoutPending(cartId: string): Promise<void>;
}

/** Puerto para crear orden + pago pending. */
export interface OrderCreatorPort {
  /** Crea orden + pago pending en una única operación. */
  createOrderAndPayment(params: {
    cartId: string;
    userId: string;
    itemsSubtotalCop: bigint;
    deliveryFeeCop: bigint;
    ivaCop: bigint;
    taxRateBasisPoints: number;
    totalCop: bigint;
    deliveryRecipientName: string;
    deliveryLine1: string;
    deliveryCity: string;
    deliveryPhone: string;
    provider: 'WOMPI' | 'MERCADO_PAGO';
    providerReference: string | null;
    paymentIdempotencyKey: string;
    items: ReadonlyArray<{
      productId: string;
      productName: string;
      unit: string;
      unitPriceCop: bigint;
      quantity: number;
      subtotalCop: bigint;
    }>;
  }): Promise<{ orderId: string; orderNumber: string; paymentId: string; createdAt: string }>;
}

/** Puerto de idempotencia dentro de la transacción de checkout. */
export interface CheckoutIdempotencyPort {
  findForUpdate(
    scope: string,
    idempotencyKey: string,
  ): Promise<{ bodyHash: string; responseJson: unknown } | null>;

  save(params: {
    scope: string;
    idempotencyKey: string;
    bodyHash: string;
    responseJson: unknown;
  }): Promise<void>;
}
