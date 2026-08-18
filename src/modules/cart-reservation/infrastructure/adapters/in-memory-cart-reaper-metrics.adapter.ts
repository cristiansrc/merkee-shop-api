import { Injectable } from '@nestjs/common';
import { CartReaperMetricsPort } from '../../domain/ports/cart-reaper-metrics.port';

/**
 * Adapter in-memory de métricas del reaper para tests (infrastructure).
 *
 * Acumula contadores y snapshots de gauges sin prom-client.
 * Expone un snapshot inmutable para aserciones en tests.
 *
 * REGLA: este adapter NO se permite en producción; solo para tests
 * y integración.
 */
@Injectable()
export class InMemoryCartReaperMetricsAdapter
  implements CartReaperMetricsPort
{
  private processedCounts: Record<string, number> = {
    released: 0,
    skipped: 0,
    error: 0,
  };
  private releasedCount = 0;
  private lagObservations: number[] = [];
  private activeCount = 0;

  incProcessed(outcome: 'released' | 'skipped' | 'error'): void {
    this.processedCounts[outcome]++;
  }

  incReleased(): void {
    this.releasedCount++;
  }

  observeExpiredLag(lagSeconds: number): void {
    this.lagObservations.push(lagSeconds);
  }

  setActiveCount(count: number): void {
    this.activeCount = count;
  }

  /** Devuelve un snapshot inmutable del estado actual de métricas. */
  snapshot(): Readonly<{
    processedCounts: Record<string, number>;
    releasedCount: number;
    lagObservations: number[];
    activeCount: number;
  }> {
    return {
      processedCounts: { ...this.processedCounts },
      releasedCount: this.releasedCount,
      lagObservations: [...this.lagObservations],
      activeCount: this.activeCount,
    };
  }
}
