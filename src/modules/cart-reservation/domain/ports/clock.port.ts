/**
 * Puerto de salida de reloj del módulo `cart-reservation`.
 *
 * Abstrae el tiempo para pruebas deterministas de expiración de reservas
 * ACTIVE (10 min) y del reaper (AC-11).
 */
export interface ClockPort {
  /** Devuelve el instante actual. */
  now(): Date;
}
