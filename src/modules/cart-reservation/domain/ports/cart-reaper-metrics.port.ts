/**
 * Puerto de métricas del reaper de reservas del módulo `cart-reservation`.
 *
 * Emite contadores y gauges para observabilidad del reaper (AC-11 /
 * Master Spec §93). Los nombres canónicos están definidos en la spec;
 * el adapter de producción usa Prometheus y el de tests usa memoria.
 *
 * REGLA: nunca emitir PII, IDs de sesión, IDs de producto, emails,
 * nombres ni datos identificables.
 */
export interface CartReaperMetricsPort {
  /**
   * Incrementa el contador de reservas procesadas por el reaper.
   * @param outcome - `released` | `skipped` | `error`
   */
  incProcessed(outcome: 'released' | 'skipped' | 'error'): void;

  /**
   * Incrementa el contador de reservas efectivamente liberadas.
   */
  incReleased(): void;

  /**
   * Registra el lag en segundos entre el instante actual y el
   * `expires_at` de cada reserva procesada.
   * @param lagSeconds - Segundos transcurridos desde la expiración.
   */
  observeExpiredLag(lagSeconds: number): void;

  /**
   * Actualiza el gauge de reservas ACTIVE restantes tras un batch.
   * @param count - Número de reservas ACTIVE restantes.
   */
  setActiveCount(count: number): void;
}
