/**
 * Puerto de salida de reserva de inventario del módulo `cart-reservation`
 * (ADR-008).
 *
 * La reserva al agregar bloquea producto+reserva, valida disponibilidad y
 * actualiza ambos atómicamente. Solo `cart-reservation` y `payments` escriben
 * `products.stock_reserved` (ADR-013). Esqueleto: contrato declarado.
 */
export interface InventoryReservationPort {
  /** Reserva stock de un producto para un carrito. */
  reserve(productId: string, quantity: number): Promise<ReservationResult>;
  /** Libera una reserva (reaper o promoción guest→admin). */
  release(reservationId: string): Promise<void>;
}

/** Resultado de una reserva. */
export interface ReservationResult {
  readonly reservationId: string;
  readonly reservedQuantity: number;
}
