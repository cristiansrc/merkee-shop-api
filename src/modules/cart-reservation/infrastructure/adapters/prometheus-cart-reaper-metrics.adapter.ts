import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { CartReaperMetricsPort } from '../../domain/ports/cart-reaper-metrics.port';
import { REAPER_METRICS_PREFIX } from '../../domain/ports/cart-reaper.config';

/**
 * Registry global de prom-client para métricas del reaper.
 * Se limpia entre tests para evitar duplicados.
 */
const registry = new Registry();

/**
 * Adapter Prometheus de métricas del reaper (infrastructure).
 *
 * Emite contadores y gauges canónicos definidos en Master Spec §93:
 * - `reservation_reaper_processed_total{outcome}` — reservas procesadas.
 * - `reservation_reaper_released_total` — reservas efectivamente liberadas.
 * - `reservation_expired_lag_seconds` — lag entre expiración y procesamiento.
 * - `reservation_active_total` — reservas ACTIVE restantes tras batch.
 *
 * REGLA: nunca emitir PII, IDs de sesión, IDs de producto, emails,
 * nombres ni datos identificables.
 */
@Injectable()
export class PrometheusCartReaperMetricsAdapter
  implements CartReaperMetricsPort
{
  private readonly processedCounter: Counter;
  private readonly releasedCounter: Counter;
  private readonly lagHistogram: Histogram;
  private readonly activeGauge: Gauge;

  constructor() {
    this.processedCounter = new Counter({
      name: `${REAPER_METRICS_PREFIX}_processed_total`,
      help: 'Total de reservas procesadas por el reaper.',
      labelNames: ['outcome'],
      registers: [registry],
    });

    this.releasedCounter = new Counter({
      name: `${REAPER_METRICS_PREFIX}_released_total`,
      help: 'Total de reservas efectivamente liberadas por el reaper.',
      registers: [registry],
    });

    this.lagHistogram = new Histogram({
      name: `${REAPER_METRICS_PREFIX}_expired_lag_seconds`,
      help: 'Lag en segundos entre la expiración de la reserva y su procesamiento por el reaper.',
      buckets: [10, 30, 60, 120, 300, 600],
      registers: [registry],
    });

    this.activeGauge = new Gauge({
      name: `${REAPER_METRICS_PREFIX}_active_total`,
      help: 'Número de reservas ACTIVE restantes tras un batch del reaper.',
      registers: [registry],
    });
  }

  incProcessed(outcome: 'released' | 'skipped' | 'error'): void {
    this.processedCounter.inc({ outcome });
  }

  incReleased(): void {
    this.releasedCounter.inc();
  }

  observeExpiredLag(lagSeconds: number): void {
    this.lagHistogram.observe(lagSeconds);
  }

  setActiveCount(count: number): void {
    this.activeGauge.set(count);
  }

  /** Limpia el registry global (solo para tests). */
  static clearMetrics(): void {
    registry.clear();
  }
}
