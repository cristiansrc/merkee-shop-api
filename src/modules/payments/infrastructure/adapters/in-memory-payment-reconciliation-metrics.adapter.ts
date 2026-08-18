import { Injectable } from '@nestjs/common';
import { PaymentReconciliationMetricsPort } from '../../domain/ports/payment-reconciliation-metrics.port';

/**
 * Adapter in-memory de métricas de reconciliación para tests (infrastructure).
 *
 * Acumula contadores y snapshots sin prom-client.
 * Expone un snapshot inmutable para aserciones en tests.
 *
 * REGLA: este adapter NO se permite en producción; solo para tests
 * y integración.
 */
@Injectable()
export class InMemoryPaymentReconciliationMetricsAdapter
  implements PaymentReconciliationMetricsPort
{
  private runCounts: Record<string, number> = {
    completed: 0,
    failed: 0,
  };
  private reconciledCount = 0;
  private expiredCount = 0;
  private refundCount = 0;
  private errorsCount = 0;
  private lastSuccessTimestamp = 0;

  incRun(outcome: 'completed' | 'failed'): void {
    this.runCounts[outcome]++;
  }

  incReconciled(): void {
    this.reconciledCount++;
  }

  incExpired(): void {
    this.expiredCount++;
  }

  incRefund(): void {
    this.refundCount++;
  }

  incError(): void {
    this.errorsCount++;
  }

  setLastSuccessTimestamp(timestamp: number): void {
    this.lastSuccessTimestamp = timestamp;
  }

  /** Devuelve un snapshot inmutable del estado actual de métricas. */
  snapshot(): Readonly<{
    runCounts: Record<string, number>;
    reconciledCount: number;
    expiredCount: number;
    refundCount: number;
    errorsCount: number;
    lastSuccessTimestamp: number;
  }> {
    return {
      runCounts: { ...this.runCounts },
      reconciledCount: this.reconciledCount,
      expiredCount: this.expiredCount,
      refundCount: this.refundCount,
      errorsCount: this.errorsCount,
      lastSuccessTimestamp: this.lastSuccessTimestamp,
    };
  }
}
