import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';
import { CartReaperPort } from '../../domain/ports/cart-reaper.port';
import { CartReaperMetricsPort } from '../../domain/ports/cart-reaper-metrics.port';
import { ClockPort } from '../../domain/ports/clock.port';
import {
  REAPER_BATCH_SIZE,
  REAPER_MAX_RETRIES,
  REAPER_RETRY_DELAYS_MS,
  REAPER_LOG_NAME,
} from '../../domain/ports/cart-reaper.config';

/** Resultado de éxito del caso de uso de expiración. */
export interface ExpireCartReservationsResult {
  /** Número de reservas efectivamente liberadas en este batch. */
  readonly released: number;
  /** Número de reservas seleccionadas en este batch. */
  readonly selected: number;
  /** Número de reservas saltadas por estado terminal. */
  readonly skippedTerminal: number;
}

/**
 * Caso de uso: expirar reservas ACTIVE del carrito (AC-11 / Master Spec §93).
 *
 * Ejecutado por el scheduled adapter cada minuto. Selecciona un lote
 * de hasta 500 reservas ACTIVE cuyo `expires_at` es anterior al instante
 * actual, y las libera condicionalmente (transición ACTIVE→EXPIRED +
 * decremento de `stock_reserved`).
 *
 * Reglas:
 * - Solo procesa reservas ACTIVE; CHECKOUT_PENDING permanece intacta.
 * - Transición condicional evita doble liberación (dos reapers concurrentes).
 * - Reintentos 1/5/15s ante fallo de batch; rollback total.
 * - Métricas sin PII; log `inventory.reservation_released` sin datos
 *   identificables.
 * - Si el batch completo se omite (todas saltadas), el caso de uso
 *   detiene la iteración (guard anti-bucle).
 */
export class ExpireCartReservationsUseCase {
  constructor(
    private readonly reaper: CartReaperPort,
    private readonly metrics: CartReaperMetricsPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<Result<ExpireCartReservationsResult, DomainError>> {
    const now = this.clock.now();
    let lastError: DomainError | null = null;

    for (let attempt = 0; attempt <= REAPER_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = REAPER_RETRY_DELAYS_MS[attempt - 1];
        await this.sleep(delay);
      }

      try {
        const batch = await this.reaper.expireBatch(now, REAPER_BATCH_SIZE);

        // Emitir métricas tras batch exitoso
        this.metrics.incProcessed('released');

        for (let i = 0; i < batch.released; i++) {
          this.metrics.incReleased();
        }

        if (batch.skippedTerminal > 0) {
          for (let i = 0; i < batch.skippedTerminal; i++) {
            this.metrics.incProcessed('skipped');
          }
        }

        // Log sin PII (solo conteos, sin IDs)
        if (batch.released > 0) {
          console.log(
            JSON.stringify({
              event: REAPER_LOG_NAME,
              released: batch.released,
              selected: batch.selected,
              skipped_terminal: batch.skippedTerminal,
              timestamp: now.toISOString(),
            }),
          );
        }

        return ok({
          released: batch.released,
          selected: batch.selected,
          skippedTerminal: batch.skippedTerminal,
        });
      } catch (error) {
        this.metrics.incProcessed('error');
        lastError = CartErrors.technicalFailure();
        // Continuar con siguiente reintento
      }
    }

    // Agotados los reintentos
    return fail(lastError ?? CartErrors.technicalFailure());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
