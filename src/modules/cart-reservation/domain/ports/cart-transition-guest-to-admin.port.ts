/**
 * Puerto de transición guest→admin del módulo `cart-reservation`.
 *
 * Implementa la transición destructiva documentada en ADR-014:
 * - Libera todas las reservas ACTIVE de la sesión guest.
 * - Cierra el carrito (ACTIVE → CLOSED).
 * - Conserva CHECKOUT_PENDING hasta pago/reconciliación.
 *
 * La sesión admin resultante no tiene carrito.
 *
 * Este puerto se inyecta en el módulo `identity` como sustituto del
 * `NoopCartReservationAdapter` (MSF-ID-001).
 */
export interface CartTransitionGuestToAdminPort {
  /**
   * Libera todas las reservas ACTIVE y cierra el carrito de la sesión guest.
   *
   * Operación idempotente: si no hay carrito o reservas, es no-op.
   * Si el carrito tiene reservas CHECKOUT_PENDING, NO se liberan.
   *
   * @param guestSessionId - ID de la sesión guest a transicionar.
   */
  releaseAndClose(guestSessionId: string): Promise<void>;
}
