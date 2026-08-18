/**
 * Puerto de salida de checkout hacia `cart-reservation` (ADR-013).
 *
 * Checkout usa los puertos de `cart-reservation` para convertir ACTIVE →
 * CHECKOUT_PENDING, sin depender transitivamente vía `orders`. Esqueleto:
 * contrato declarado.
 */
export interface CheckoutReservationPort {
  /** Convierte las reservas ACTIVE de un carrito a CHECKOUT_PENDING. */
  convertActiveToCheckoutPending(cartId: string): Promise<void>;
}
