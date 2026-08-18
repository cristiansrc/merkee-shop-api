/**
 * Puerto de salida del evaluador de estado de `scope` para la purga.
 *
 * Determina si un `scope` tiene una operación asociada pendiente. Si la tiene,
 * el registro no se purga (razón `operation_pending`). La implementación
 * concreta conoce la semántica de cada scope (ADR-018).
 */
export interface IdempotencyScopeEvaluatorPort {
  /**
   * Devuelve `true` si el scope tiene una operación asociada pendiente.
   * Para `admin-provision:{actorId}` la operación es terminal al confirmar la
   * transacción de provisión; cualquier scope desconocido se trata como
   * pendiente (conservador: no se purga).
   */
  hasPendingOperation(scope: string): Promise<boolean>;
}
