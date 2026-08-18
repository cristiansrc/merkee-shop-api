import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';
import { PaymentReconciliationMetricsPort } from '../../domain/ports/payment-reconciliation-metrics.port';
import { RECONCILIATION_METRICS_PREFIX } from '../../domain/ports/payment-reconciliation.config';

/**
 * Registry global de prom-client para métricas de reconciliación.
 * Se limpia entre tests para evitar duplicados.
 */
const registry = new Registry();

/**
 * Adapter Prometheus de métricas de reconciliación (infrastructure).
 *
 * Emite contadores y gauges canónicos definidos en Master Spec §95:
 * - `payment_reconciliation_runs_total{outcome}` — runs de reconciliación.
 * - `payment_reconciliation_reconciled_total` — pagos reconciliados.
 * - `payment_reconciliation_expired_total` — pagos expirados.
 * - `payment_reconciliation_refund_total` — refunds automáticos.
 * - `payment_reconciliation_errors_total` — errores de reconciliación.
 * - `payment_reconciliation_last_success_timestamp_seconds` — último run exitoso.
 *
 * REGLA: nunca emitir PII, IDs de sesión, IDs de producto, emails,
 * nombres ni datos identificables.
 */
@Injectable()
export class PrometheusPaymentReconciliationMetricsAdapter
  implements PaymentReconciliationMetricsPort
{
  private readonly runsCounter: Counter;
  private readonly reconciledCounter: Counter;
  private readonly expiredCounter: Counter;
  private readonly refundCounter: Counter;
  private readonly errorsCounter: Counter;
  private readonly lastSuccessGauge: Gauge;

  constructor() {
    this.runsCounter = new Counter({
      name: `${RECONCILIATION_METRICS_PREFIX}_runs_total`,
      help: 'Total de runs del job de reconciliación de pagos.',
      labelNames: ['outcome'],
      registers: [registry],
    });

    this.reconciledCounter = new Counter({
      name: `${RECONCILIATION_METRICS_PREFIX}_reconciled_total`,
      help: 'Total de pagos reconciliados (transicionados a terminal).',
      registers: [registry],
    });

    this.expiredCounter = new Counter({
      name: `${RECONCILIATION_METRICS_PREFIX}_expired_total`,
      help: 'Total de pagos expirados (>24h sin aprobación).',
      registers: [registry],
    });

    this.refundCounter = new Counter({
      name: `${RECONCILIATION_METRICS_PREFIX}_refund_total`,
      help: 'Total de refunds automáticos (hold no consumible).',
      registers: [registry],
    });

    this.errorsCounter = new Counter({
      name: `${RECONCILIATION_METRICS_PREFIX}_errors_total`,
      help: 'Total de errores de reconciliación.',
      registers: [registry],
    });

    this.lastSuccessGauge = new Gauge({
      name: `${RECONCILIATION_METRICS_PREFIX}_last_success_timestamp_seconds`,
      help: 'Timestamp del último run exitoso de reconciliación.',
      registers: [registry],
    });
  }

  incRun(outcome: 'completed' | 'failed'): void {
    this.runsCounter.inc({ outcome });
  }

  incReconciled(): void {
    this.reconciledCounter.inc();
  }

  incExpired(): void {
    this.expiredCounter.inc();
  }

  incRefund(): void {
    this.refundCounter.inc();
  }

  incError(): void {
    this.errorsCounter.inc();
  }

  setLastSuccessTimestamp(timestamp: number): void {
    this.lastSuccessGauge.set(timestamp);
  }

  /** Limpia el registry global (solo para tests). */
  static clearMetrics(): void {
    registry.clear();
  }
}
