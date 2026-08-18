import { Injectable, Optional } from '@nestjs/common';
import { Counter, Gauge, Registry, register } from 'prom-client';
import {
  PurgeMetricsPort,
  PurgeOutcome,
  PurgeSkipReason,
} from '../../domain/ports/purge-metrics.port';

/** Nombres canónicos de métricas de purga (ADR-018). */
export const PURGE_METRIC_RUNS = 'idempotency_records_purge_runs_total';
export const PURGE_METRIC_DELETED = 'idempotency_records_purge_deleted_total';
export const PURGE_METRIC_SKIPPED = 'idempotency_records_purge_skipped_total';
export const PURGE_METRIC_ERRORS = 'idempotency_records_purge_errors_total';
export const PURGE_METRIC_LAST_SUCCESS =
  'idempotency_records_purge_last_success_timestamp_seconds';

/**
 * Adapter de métricas de purga de `idempotency_records` para Prometheus
 * (ADR-018). Implementa `PurgeMetricsPort` emitiendo contadores y un gauge en
 * un `Registry` de prom-client. No registra scope, claves, cuerpos ni ningún
 * dato personal: solo contadores y timestamps (sin PII).
 *
 * Por defecto usa el registry global de prom-client (`register`) para que el
 * endpoint `/metrics` pueda exponerlas; en tests se inyecta un `Registry`
 * aislado para verificar los valores exactos.
 */
@Injectable()
export class PrometheusPurgeMetricsAdapter implements PurgeMetricsPort {
  private readonly runs: Counter<string>;
  private readonly deleted: Counter<string>;
  private readonly skipped: Counter<string>;
  private readonly errors: Counter<string>;
  private readonly lastSuccess: Gauge<string>;

  constructor(@Optional() registry: Registry = register) {
    // Reutiliza métricas ya registradas en el registry (p. ej. al recompilar
    // el módulo en tests) para evitar el error de registro duplicado.
    this.runs = this.counter(registry, PURGE_METRIC_RUNS, {
      help: 'Total de ejecuciones de purga de idempotency_records por outcome.',
      labelNames: ['outcome'],
    });
    this.deleted = this.counter(registry, PURGE_METRIC_DELETED, {
      help: 'Total de registros de idempotencia purgados.',
    });
    this.skipped = this.counter(registry, PURGE_METRIC_SKIPPED, {
      help: 'Total de registros de idempotencia omitidos por razón.',
      labelNames: ['reason'],
    });
    this.errors = this.counter(registry, PURGE_METRIC_ERRORS, {
      help: 'Total de errores de ejecución de la purga de idempotencia.',
    });
    this.lastSuccess = this.gauge(registry, PURGE_METRIC_LAST_SUCCESS, {
      help: 'Timestamp Unix (segundos) de la última purga exitosa.',
    });
  }

  private counter(
    registry: Registry,
    name: string,
    opts: { help: string; labelNames?: string[] },
  ): Counter<string> {
    const existing = registry.getSingleMetric(name);
    if (existing) {
      return existing as Counter<string>;
    }
    return new Counter({
      name,
      help: opts.help,
      labelNames: opts.labelNames ?? [],
      registers: [registry],
    });
  }

  private gauge(
    registry: Registry,
    name: string,
    opts: { help: string },
  ): Gauge<string> {
    const existing = registry.getSingleMetric(name);
    if (existing) {
      return existing as Gauge<string>;
    }
    return new Gauge({
      name,
      help: opts.help,
      registers: [registry],
    });
  }

  recordRun(outcome: PurgeOutcome): void {
    this.runs.inc({ outcome });
  }

  recordDeleted(count: number): void {
    this.deleted.inc(count);
  }

  recordSkipped(reason: PurgeSkipReason, count: number): void {
    this.skipped.inc({ reason }, count);
  }

  recordError(): void {
    this.errors.inc();
  }

  recordLastSuccess(timestamp: Date): void {
    this.lastSuccess.set(timestamp.getTime() / 1000);
  }
}
