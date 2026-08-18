/**
 * Puerto de salida de reserva de stock del módulo `cart-reservation` (ADR-008).
 *
 * La reserva bloquea producto+reserva, valida disponibilidad y actualiza ambos
 * atómicamente. Solo `cart-reservation` y `payments` escriben
 * `products.stock_reserved` (ADR-013).
 */
import { StockReservation } from '../models';

export interface StockReservationPort {
  /**
   * Reserva stock de un producto para un carrito.
   * Lock SELECT FOR UPDATE por product_id ASC para evitar deadlocks.
   * Retorna la reserva creada o error de stock insuficiente.
   */
  reserve(params: ReserveStockParams): Promise<StockReservation>;

  /**
   * Ajusta la cantidad de una reserva existente (SET quantity).
   * Lock SELECT FOR UPDATE por product_id ASC.
   * Si la nueva cantidad es mayor, reserva stock adicional.
   * Si es menor, libera el excedente decrementando stock_reserved.
   */
  adjustReservation(params: AdjustReservationParams): Promise<void>;

  /**
   * Libera una reserva (DELETE + decrementa stock_reserved).
   * Idempotente: si la reserva ya no está ACTIVE, no-op.
   */
  release(reservationId: string): Promise<void>;

  /**
   * Libera todas las reservas ACTIVE de un carrito.
   * Usado por reaper, promoción guest→admin, logout.
   */
  releaseAllForCart(cartId: string): Promise<void>;

  /**
   * Convierte una reserva ACTIVE a CHECKOUT_PENDING.
   * Usado por checkout para congelar la reserva.
   */
  convertToCheckoutPending(reservationId: string): Promise<void>;
}

/** Parámetros para reservar stock. */
export interface ReserveStockParams {
  readonly cartId: string;
  readonly cartItemId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly expiresAt: Date;
}

/** Parámetros para ajustar una reserva existente. */
export interface AdjustReservationParams {
  readonly reservationId: string;
  readonly productId: string;
  readonly newQuantity: number;
  readonly expiresAt: Date;
}
