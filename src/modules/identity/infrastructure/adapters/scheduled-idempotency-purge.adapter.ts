import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { isFailure } from '../../../../shared/domain/result';
import { PurgeIdempotencyRecordsUseCase } from '../../application/use-cases/purge-idempotency-records.use-case';
import { PurgeLoggerPort } from '../../domain/ports/purge-logger.port';
import { PurgeMetricsPort } from '../../domain/ports/purge-metrics.port';
import { IDENTITY_TOKENS } from '../../identity.tokens';

/** Hora diaria por defecto (24h, UTC) para la purga: 02:00. */
export const DEFAULT_PURGE_SCHEDULE_TIME = '02:00';

/** Variable de entorno que habilita/deshabilita el scheduler diario. */
export const PURGE_SCHEDULE_ENABLED_ENV = 'IDEMPOTENCY_PURGE_SCHEDULE_ENABLED';
/** Variable de entorno con la hora diaria (HH:MM, 24h, UTC). */
export const PURGE_SCHEDULE_TIME_ENV = 'IDEMPOTENCY_PURGE_SCHEDULE_TIME';

/** Configuración del scheduler diario de purga. */
export interface PurgeScheduleConfig {
  /** Si `false`, el scheduler no se programa (tests/entornos sin job). */
  readonly enabled: boolean;
  /** Hora diaria `HH:MM` en 24h (UTC). Default `02:00`. */
  readonly time: string;
}

/** Configuración por defecto: habilitado a las 02:00 UTC. */
export const DEFAULT_PURGE_SCHEDULE_CONFIG: PurgeScheduleConfig = {
  enabled: true,
  time: DEFAULT_PURGE_SCHEDULE_TIME,
};

/**
 * Driving adapter programado de purga de `idempotency_records` (ADR-018).
 *
 * Cablea localmente el scheduler diario en la aplicación: al arrancar programa
 * la ejecución del caso de uso una vez al día a la hora configurada (por
 * defecto 02:00 UTC). AWS podrá coordinar/reemplazar el disparo sin eliminar
 * este wiring. Es configurable vía `PurgeScheduleConfig` (token DI) y
 * deshabilitable (por defecto habilitado); en tests se inyecta
 * `enabled: false` para que no se programe ningún job.
 *
 * `start()` es idempotente: no duplica jobs si se invoca más de una vez.
 * No contiene reglas de negocio ni Prisma.
 *
 * Proyecta el `Result<void, DomainError>` que devuelve el caso de uso (ROP /
 * ADR-017) sin propagar la causa técnica, PII ni scope: registra la métrica
 * `recordRun('error')` + `recordError()` y un log de error sanitizado en
 * caso de `Failure`, y deja que el siguiente ciclo del scheduler reintente.
 * No relanza: el job no debe tumbar el proceso.
 */
@Injectable()
export class ScheduledIdempotencyPurgeAdapter
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(
    private readonly purgeUseCase: PurgeIdempotencyRecordsUseCase,
    @Optional()
    @Inject(IDENTITY_TOKENS.PURGE_SCHEDULE_CONFIG)
    private readonly config: PurgeScheduleConfig = DEFAULT_PURGE_SCHEDULE_CONFIG,
    @Optional()
    @Inject(IDENTITY_TOKENS.PURGE_METRICS)
    private readonly metrics?: PurgeMetricsPort,
    @Optional()
    @Inject(IDENTITY_TOKENS.PURGE_LOGGER)
    private readonly logger?: PurgeLoggerPort,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      return;
    }
    this.start();
  }

  /**
   * Programa el scheduler diario. Idempotente: si ya está programado, no
   * duplica el job.
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.scheduleNext();
  }

  /**
   * Ejecuta un ciclo de purga proyectando el `Result` del caso de uso.
   * Idempotente y seguro de invocar repetidamente. En `Failure` registra
   * métrica/log de error sanitizado sin transportar causa, scope, PII ni
   * secretos; nunca relanza.
   */
  async run(): Promise<void> {
    const result = await this.purgeUseCase.execute();
    if (isFailure(result)) {
      if (this.metrics) {
        this.metrics.recordRun('error');
        this.metrics.recordError();
      }
      if (this.logger) {
        // Log sanitizado: solo el código estable (no causa, mensaje, scope ni
        // PII) para mantener la trazabilidad interna sin filtrar detalles.
        this.logger.error('idempotency_records.purge_failed', {
          code: result.error.code,
        });
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    const delay = this.msUntilNextRun(this.config.time);
    this.timer = setTimeout(() => {
      void this.run();
      this.scheduleNext();
    }, delay);
  }

  /** Milisegundos hasta la próxima ocurrencia de `HH:MM` (UTC). */
  private msUntilNextRun(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hours, minutes, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }
}
