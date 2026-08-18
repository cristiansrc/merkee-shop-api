import { Injectable, Logger, Optional } from '@nestjs/common';
import { ReconcilePendingPaymentsUseCaseImpl } from '../../application/use-cases/reconcile-pending-payments.use-case';
import { ReconcilePendingPaymentsUseCase } from '../../domain/ports/payment-reconciliation.port';
import { PaymentReconciliationMetricsPort } from '../../domain/ports/payment-reconciliation-metrics.port';
import {
  RECONCILIATION_INTERVAL_MS,
  RECONCILIATION_RETRY_DELAYS_MS,
} from '../../domain/ports/payment-reconciliation.config';

/**
 * Configuración del scheduler de reconciliación.
 */
export interface PaymentReconciliationScheduleConfig {
  /** Habilitar/deshabilitar el scheduler (default: true). */
  readonly enabled: boolean;
  /** Intervalo de ejecución en ms (default: 900_000 = 15 min). */
  readonly intervalMs: number;
}

/**
 * Driving adapter del job de reconciliación de pagos (infrastructure).
 *
 * Programa la ejecución periódica del caso de uso
 * `ReconcilePendingPaymentsUseCase` cada 15 minutos (Master Spec §95).
 *
 * - Habilitable/deshabilitable vía `PAYMENT_RECONCILIATION_SCHEDULE_ENABLED` (default: true).
 * - Intervalo configurable vía `PAYMENT_RECONCILIATION_INTERVAL_MS` (default: 900_000).
 * - En tests, `enabled: false` deshabilita el scheduler.
 * - start() es idempotente: no duplica jobs.
 * - Detiene limpiamente en `OnApplicationShutdown`.
 * - Reintentos con backoff 1s/5s/15s ante fallo de batch.
 * - Métricas de runs, reconciliaciones, expiraciones y errores.
 *
 * REGLA: el scheduler es un driving adapter local; AWS puede coordinar
 * o reemplazar el disparo sin eliminar el wiring.
 */
@Injectable()
export class ScheduledPaymentReconciliationAdapter {
  private readonly logger = new Logger(
    ScheduledPaymentReconciliationAdapter.name,
  );
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly reconcileUseCase: ReconcilePendingPaymentsUseCase,
    private readonly metrics: PaymentReconciliationMetricsPort,
    @Optional() config?: PaymentReconciliationScheduleConfig,
  ) {
    this.config = {
      enabled: config?.enabled ?? true,
      intervalMs: config?.intervalMs ?? RECONCILIATION_INTERVAL_MS,
    };
  }

  private readonly config: PaymentReconciliationScheduleConfig;

  /**
   * Inicia el scheduler periódico.
   * Idempotente: no duplica jobs si ya está corriendo.
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.log(
        JSON.stringify({
          event: 'payment_reconciliation.schedule_disabled',
          interval_ms: this.config.intervalMs,
        }),
      );
      return;
    }

    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNext();
    this.logger.log(
      JSON.stringify({
        event: 'payment_reconciliation.schedule_started',
        interval_ms: this.config.intervalMs,
      }),
    );
  }

  /**
   * Detiene el scheduler limpiamente.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.log(
      JSON.stringify({
        event: 'payment_reconciliation.schedule_stopped',
      }),
    );
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      if (!this.running) return;

      await this.executeWithRetries();

      this.scheduleNext();
    }, this.config.intervalMs);
  }

  /**
   * Ejecuta el batch de reconciliación con reintentos.
   * Backoff: 1s / 5s / 15s (RECONCILIATION_RETRY_DELAYS_MS).
   */
  private async executeWithRetries(): Promise<void> {
    const now = new Date();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= RECONCILIATION_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await this.reconcileUseCase.execute(now);

        if (result.ok) {
          const { selected, reconciled, pending, expired } = result.value;

          // Emitir métricas
          this.metrics.incRun('completed');
          this.metrics.setLastSuccessTimestamp(
            Math.floor(Date.now() / 1000),
          );

          for (let i = 0; i < reconciled; i++) {
            this.metrics.incReconciled();
          }
          for (let i = 0; i < expired; i++) {
            this.metrics.incExpired();
          }

          this.logger.log(
            JSON.stringify({
              event: 'payment_reconciliation.batch_completed',
              selected,
              reconciled,
              pending,
              expired,
            }),
          );
          return;
        }

        // Error del caso de uso (DomainError)
        lastError = result.error;
        this.metrics.incRun('failed');
        this.metrics.incError();

        this.logger.error(
          JSON.stringify({
            event: 'payment_reconciliation.batch_failed',
            error_code: result.error.code,
            attempt: attempt + 1,
          }),
        );
      } catch (error: unknown) {
        lastError = error;
        this.metrics.incRun('failed');
        this.metrics.incError();

        this.logger.error(
          JSON.stringify({
            event: 'payment_reconciliation.batch_error',
            message:
              error instanceof Error ? error.message : 'unknown_error',
            attempt: attempt + 1,
          }),
        );
      }

      // Esperar antes del siguiente reintento (si hay más intentos)
      if (attempt < RECONCILIATION_RETRY_DELAYS_MS.length) {
        const delayMs = RECONCILIATION_RETRY_DELAYS_MS[attempt];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Agotados todos los reintentos
    this.logger.error(
      JSON.stringify({
        event: 'payment_reconciliation.all_retries_exhausted',
        max_retries: RECONCILIATION_RETRY_DELAYS_MS.length,
      }),
    );
  }
}
