/**
 * Puerto de unidad de trabajo para operaciones atómicas del carrito.
 *
 * Encapsula las transacciones que involucran reserva de stock + carrito +
 * idempotencia en una única frontera transaccional (Master Spec §91-95).
 */
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartWithItemsRecord } from './cart-repository.port';

export interface CartUnitOfWorkPort {
  /**
   * Ejecuta una operación atómica sobre carrito+reserva+idempotencia.
   * El callback recibe un contexto transaccional y debe retornar Result.
   * Si el callback retorna Failure, la transacción se revierte.
   */
  run<T>(
    work: (ctx: CartTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>>;
}

/** Contexto transaccional disponible dentro de la UoW. */
export interface CartTransactionContext {
  /** Repositorio de carrito dentro de la transacción. */
  readonly cartRepo: CartTransactionRepo;
  /** Puerto de reserva de stock dentro de la transacción. */
  readonly stockReservation: CartTransactionStock;
  /** Puerto de idempotencia dentro de la transacción. */
  readonly idempotency: CartTransactionIdempotency;
}

/** Operaciones de carrito dentro de la transacción. */
export interface CartTransactionRepo {
  findCartWithItems(sessionId: string): Promise<CartWithItemsRecord | null>;
  createCart(sessionId: string): Promise<{ id: string }>;
  findCartItem(cartId: string, productId: string): Promise<{ id: string; quantity: number } | null>;
  createCartItem(item: {
    cartId: string;
    productId: string;
    quantity: number;
    unitPriceCop: bigint;
    subtotalCop: bigint;
  }): Promise<{ id: string }>;
  updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
    subtotalCop: bigint,
  ): Promise<void>;
  deleteCartItem(cartItemId: string): Promise<void>;
  updateCartTotals(
    cartId: string,
    totals: {
      itemsSubtotalCop: bigint;
      ivaCop: bigint;
      totalCop: bigint;
      reservationExpiresAt: Date | null;
    },
  ): Promise<void>;
  touchSession(sessionId: string, now: Date): Promise<void>;
}

/** Operaciones de reserva de stock dentro de la transacción. */
export interface CartTransactionStock {
  reserve(params: {
    cartId: string;
    cartItemId: string;
    productId: string;
    quantity: number;
    expiresAt: Date;
  }): Promise<{ id: string }>;

  adjustReservation(params: {
    reservationId: string;
    productId: string;
    newQuantity: number;
    expiresAt: Date;
  }): Promise<void>;

  release(reservationId: string): Promise<void>;
  releaseAllForCart(cartId: string): Promise<void>;
}

/** Operaciones de idempotencia dentro de la transacción. */
export interface CartTransactionIdempotency {
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
