/**
 * Puerto de salida de métricas de purga de `idempotency_records` (ADR-018).
 *
 * Las métricas no contienen PII: solo contadores y timestamps. La
 * implementación concreta (Prometheus u otro backend) vive en infrastructure.
 */
export type PurgeOutcome = 'success' | 'error';

export type PurgeSkipReason =
  | 'retention_not_elapsed'
  | 'minimum_age_not_elapsed'
  | 'replay_active'
  | 'operation_pending';

export interface PurgeMetricsPort {
  /** `idempotency_records_purge_runs_total{outcome}`. */
  recordRun(outcome: PurgeOutcome): void;
  /** `idempotency_records_purge_deleted_total`. */
  recordDeleted(count: number): void;
  /** `idempotency_records_purge_skipped_total{reason}`. */
  recordSkipped(reason: PurgeSkipReason, count: number): void;
  /** `idempotency_records_purge_errors_total`. */
  recordError(): void;
  /** `idempotency_records_purge_last_success_timestamp_seconds`. */
  recordLastSuccess(timestamp: Date): void;
}
