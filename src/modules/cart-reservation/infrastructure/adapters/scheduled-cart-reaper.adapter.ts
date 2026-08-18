import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExpireCartReservationsUseCase } from '../../application/use-cases/expire-cart-reservations.use-case';
import {
  REAPER_INTERVAL_MS,
  REAPER_RETRY_DELAYS_MS,
} from '../../domain/ports/cart-reaper.config';

/**
 * Configuración del scheduler del reaper.
 */
export interface CartReaperScheduleConfig {
  /** Habilitar/deshabilitar el scheduler (default: true). */
  readonly enabled: boolean;
  /** Intervalo de ejecución en ms (default: 60_000 = 1 min). */
  readonly intervalMs: number;
}

/**
 * Driving adapter del reaper de reservas (infrastructure).
 *
 * Programa la ejecución periódica del caso de uso
 * `ExpireCartReservationsUseCase` cada minuto (AC-11 / Master Spec §93).
 *
 * - Habilitable/deshabilitable vía `CART_REAPER_SCHEDULE_ENABLED` (default: true).
 * - Intervalo configurable vía `CART_REAPER_INTERVAL_MS` (default: 60_000).
 * - En tests, `enabled: false` deshabilita el scheduler.
 * - start() es idempotente: no duplica jobs.
 * - Detiene limpiamente en `OnApplicationShutdown`.
 *
 * REGLA: el scheduler es un driving adapter local; AWS puede coordinar
 * o reemplazar el disparo sin eliminar el wiring.
 */
@Injectable()
export class ScheduledCartReaperAdapter {
  private readonly logger = new Logger(ScheduledCartReaperAdapter.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly expireUseCase: ExpireCartReservationsUseCase,
    @Optional() config?: CartReaperScheduleConfig,
  ) {
    this.config = {
      enabled: config?.enabled ?? true,
      intervalMs: config?.intervalMs ?? REAPER_INTERVAL_MS,
    };
  }

  private readonly config: CartReaperScheduleConfig;

  /**
   * Inicia el scheduler periódico.
   * Idempotente: no duplica jobs si ya está corriendo.
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.log(
        JSON.stringify({
          event: 'cart_reaper.schedule_disabled',
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
        event: 'cart_reaper.schedule_started',
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
        event: 'cart_reaper.schedule_stopped',
      }),
    );
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      if (!this.running) return;

      try {
        const result = await this.expireUseCase.execute();
        if (result.ok) {
          this.logger.log(
            JSON.stringify({
              event: 'cart_reaper.batch_completed',
              released: result.value.released,
              selected: result.value.selected,
              skipped_terminal: result.value.skippedTerminal,
            }),
          );
        } else {
          this.logger.error(
            JSON.stringify({
              event: 'cart_reaper.batch_failed',
              error_code: result.error.code,
            }),
          );
        }
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'cart_reaper.batch_error',
            message:
              error instanceof Error ? error.message : 'unknown_error',
          }),
        );
      }

      this.scheduleNext();
    }, this.config.intervalMs);
  }
}
