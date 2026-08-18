/**
 * Puerto de salida de reloj del módulo `identity`.
 *
 * Abstrae el tiempo para permitir pruebas deterministas de expiración
 * (tokens de activación 24h, reset 30m, sesiones 10m).
 */
export interface ClockPort {
  /** Devuelve el instante actual. */
  now(): Date;
}
