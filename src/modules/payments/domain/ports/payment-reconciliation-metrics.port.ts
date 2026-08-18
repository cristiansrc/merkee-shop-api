/**
 * Puerto de métricas de reconciliación de pagos (MSF-PAY-004).
 *
 * Emite contadores y gauges para observabilidad del job de reconciliación
 * (Master Spec §95). Los nombres canónicos están definidos en la spec;
 * el adapter de producción usa Prometheus y el de tests usa memoria.
 *
 * REGLA: nunca emitir PII, IDs de sesión, IDs de producto, emails,
 * nombres ni datos identificables.
 */
export interface PaymentReconciliationMetricsPort {
  /**
   * Incrementa el contador de runs de reconciliación.
   * @param outcome - 'completed' | 'failed'
   */
  incRun(outcome: 'completed' | 'failed'): void;

  /**
   * Incrementa el contador de pagos reconciliados (transicionados a terminal).
   */
  incReconciled(): void;

  /**
   * Incrementa el contador de pagos expirados (>24h sin aprobación).
   */
  incExpired(): void;

  /**
   * Incrementa el contador de refunds automáticos (hold no consumible).
   */
  incRefund(): void;

  /**
   * Incrementa el contador de errores de reconciliación.
   */
  incError(): void;

  /**
   * Actualiza el timestamp del último run exitoso.
   * @param timestamp - Timestamp en segundos (epoch).
   */
  setLastSuccessTimestamp(timestamp: number): void;
}
