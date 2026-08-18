/**
 * Puerto de salida de log estructurado de purga de `idempotency_records`.
 *
 * Los eventos emitidos son `idempotency_records.purge_completed` y
 * `idempotency_records.purge_failed`, sin PII (ADR-018). La implementación
 * concreta (logger del framework) vive en infrastructure.
 */
export interface PurgeLoggerPort {
  /** Emite un evento informativo sin PII. */
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  /** Emite un evento de error sin PII. */
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
}
