import { Injectable } from '@nestjs/common';
import {
  PurgeMetricsPort,
  PurgeOutcome,
  PurgeSkipReason,
} from '../../domain/ports/purge-metrics.port';

/** Snapshot inmutable de métricas de purga (sin PII). */
export interface PurgeMetricsSnapshot {
  readonly runs: Readonly<Record<PurgeOutcome, number>>;
  readonly deleted: number;
  readonly skipped: Readonly<Record<PurgeSkipReason, number>>;
  readonly errors: number;
  readonly lastSuccess: Date | null;
}

/**
 * Adapter de métricas de purga en memoria (sin PII).
 *
 * Implementa el contrato de métricas de ADR-018 acumulando contadores y
 * timestamps en memoria. No registra scope, claves, cuerpos ni ningún dato
 * personal: solo contadores y timestamps. Expone `snapshot()` para que la
 * observabilidad (Prometheus u otro backend) y los tests lean el estado
 * acumulado de forma inmutable. Es un adapter real y testeable (a diferencia
 * del placeholder no-op anterior).
 */
@Injectable()
export class InMemoryPurgeMetricsAdapter implements PurgeMetricsPort {
  private readonly runs: Record<PurgeOutcome, number> = {
    success: 0,
    error: 0,
  };
  private deleted = 0;
  private readonly skipped: Record<PurgeSkipReason, number> = {
    retention_not_elapsed: 0,
    minimum_age_not_elapsed: 0,
    replay_active: 0,
    operation_pending: 0,
  };
  private errors = 0;
  private lastSuccess: Date | null = null;

  recordRun(outcome: PurgeOutcome): void {
    this.runs[outcome] += 1;
  }

  recordDeleted(count: number): void {
    this.deleted += count;
  }

  recordSkipped(reason: PurgeSkipReason, count: number): void {
    this.skipped[reason] += count;
  }

  recordError(): void {
    this.errors += 1;
  }

  recordLastSuccess(timestamp: Date): void {
    this.lastSuccess = timestamp;
  }

  /** Snapshot inmutable de las métricas acumuladas (sin PII). */
  snapshot(): PurgeMetricsSnapshot {
    return {
      runs: { ...this.runs },
      deleted: this.deleted,
      skipped: { ...this.skipped },
      errors: this.errors,
      lastSuccess: this.lastSuccess,
    };
  }
}
