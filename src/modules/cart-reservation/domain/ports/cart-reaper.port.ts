/**
 * Puerto de salida de expiración de reservas del módulo `cart-reservation`.
 *
 * Encapsula la selección atómica y liberación de reservas ACTIVE expiradas
 * por el reaper (AC-11). Solo libera reservas ACTIVE; CHECKOUT_PENDING
 * permanece hasta terminal de pago/reconciliación.
 *
 * El adapter implementa la transición condicional para evitar doble
 * liberación cuando dos reapers corren concurrentemente.
 */
export interface CartReaperPort {
  /**
   * Selecciona y libera un lote de reservas ACTIVE expiradas.
   *
   * - Selecciona hasta `limit` filas con `expires_at < now` y `status = ACTIVE`.
   * - Usa transacción con timeout 5s y advisory lock para exclusión mutua.
   * - Transición condicional: solo libera si la reserva sigue ACTIVE.
   * - Decrementa `stock_reserved` por cada reserva liberada.
   * - Marca la reserva como EXPIRED.
   *
   * @param now - Instante actual del reloj.
   * @param limit - Tamaño máximo del lote (≤500).
   * @returns Resultado del batch con conteos de procesados y liberados.
   */
  expireBatch(now: Date, limit: number): Promise<ReaperBatchResult>;
}

/** Resultado de un batch del reaper. */
export interface ReaperBatchResult {
  /** Número total de reservas seleccionadas en el lote. */
  readonly selected: number;
  /** Número de reservas que fueron efectivamente liberadas. */
  readonly released: number;
  /** Número de reservas que ya estaban en estado terminal (no ACTIVE). */
  readonly skippedTerminal: number;
}
