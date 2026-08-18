import { ClockPort } from '../../domain/ports/clock.port';
import { IdempotencyPurgeRepositoryPort } from '../../domain/ports/idempotency-purge-repository.port';
import { IdempotencyScopeEvaluatorPort } from '../../domain/ports/idempotency-scope-evaluator.port';
import { PurgeMetricsPort } from '../../domain/ports/purge-metrics.port';
import { PurgeLoggerPort } from '../../domain/ports/purge-logger.port';
import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/** Retención técnica v1: 30 días completos desde `created_at` (ADR-018). */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Protección defensiva mínima: nunca borrar antes de 24 horas. */
const MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;
/** Tamaño máximo de lote por batch. */
const BATCH_SIZE = 500;
/** Reintentos del batch ante fallo transitorio (1/5/15 s). */
const BATCH_RETRY_DELAYS_MS = [1000, 5000, 15000];
/** Número máximo de intentos por batch. */
const MAX_BATCH_ATTEMPTS = 3;

/** Función de espera inyectable para pruebas deterministas. */
type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Caso de uso de purga de `idempotency_records` (ADR-018 / Master Spec §NC-08).
 *
 * Job controlado diario que elimina en batches de hasta 500 filas con retención
 * vencida (30 días desde `created_at`), protección mínima de 24 horas, sin
 * replay vigente y sin operación pendiente para el `scope`. Cada batch se
 * procesa en una única transacción PostgreSQL `READ COMMITTED` (advisory lock +
 * selección `FOR UPDATE SKIP LOCKED` + evaluación + delete + métricas de
 * resultado) gestionada por el adapter; un fallo revierte el batch completo y
 * se reintenta hasta tres veces (1/5/15 s). Emite métricas y logs sin PII.
 *
 * Alineado a ROP (Master Spec §ROP / ADR-017): `execute` devuelve
 * `Result<void, DomainError>`. La capa `application` NO captura excepciones
 * técnicas; la traducción de `Prisma`/`DB`/lock/timeout a `DomainError`
 * ocurre en el límite del adapter (`PrismaIdempotencyPurgeRepositoryAdapter`).
 * El adapter devuelve `fail(technicalFailure())` sin causa/PII; el caso de uso
 * propaga el `Failure` al driving scheduler sin filtrar metadatos. Las
 * métricas de error se actualizan a través del puerto `metrics` desde el
 * scheduler (que ya es el límite externo), manteniendo la separación de
 * responsabilidades entre application (reglas de negocio) y el driving
 * adapter (registro de resultados).
 *
 * No expone endpoints ni modifica OpenAPI.
 */
export class PurgeIdempotencyRecordsUseCase {
  constructor(
    private readonly repo: IdempotencyPurgeRepositoryPort,
    private readonly scopeEvaluator: IdempotencyScopeEvaluatorPort,
    private readonly metrics: PurgeMetricsPort,
    private readonly logger: PurgeLoggerPort,
    private readonly clock: ClockPort,
    private readonly sleepFn: SleepFn = defaultSleep,
  ) {}

  async execute(): Promise<Result<void, DomainError>> {
    const now = this.clock.now();
    const retentionCutoff = new Date(now.getTime() - RETENTION_MS);
    const minimumAgeCutoff = new Date(now.getTime() - MINIMUM_AGE_MS);

    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const batchResult = await this.processBatchWithRetries(
        now,
        retentionCutoff,
        minimumAgeCutoff,
      );
      // Propaga `Failure` técnico del adapter sin filtrar metadatos. El driving
      // scheduler proyectará el `Result` y registrará la métrica/log de error.
      if (isFailure(batchResult)) {
        return batchResult;
      }
      const batch = batchResult.value;
      totalDeleted += batch.deleted;
      // Continúa solo si el batch devolvió el máximo (puede haber más filas)
      // y se eliminó algo. Si un batch completo se salta (no purgable), las
      // filas restantes se reintentarán en el siguiente ciclo y se evita un
      // bucle infinito.
      hasMore = batch.hasMore && batch.deleted > 0;
    }

    this.metrics.recordRun('success');
    this.metrics.recordLastSuccess(now);
    this.logger.info('idempotency_records.purge_completed', {
      deleted: totalDeleted,
    });
    return ok(undefined);
  }

  /**
   * Procesa un batch con reintentos (1/5/15 s) y rollback total ante fallo.
   * El adapter traduce las excepciones técnicas a `Failure`; el caso de uso
   * reintenta únicamente ante `Failure` (todos los `Failure` actuales son
   * técnicos del adapter, reintentables). Un `Success` cierra el ciclo de
   * reintentos.
   */
  private async processBatchWithRetries(
    now: Date,
    retentionCutoff: Date,
    minimumAgeCutoff: Date,
  ): Promise<
    Result<
      { readonly deleted: number; readonly hasMore: boolean },
      DomainError
    >
  > {
    let lastFailure: DomainError | null = null;
    for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS; attempt++) {
      const result = await this.processBatch(
        now,
        retentionCutoff,
        minimumAgeCutoff,
      );
      if (isFailure(result)) {
        lastFailure = result.error;
        if (attempt < MAX_BATCH_ATTEMPTS - 1) {
          await this.sleepFn(BATCH_RETRY_DELAYS_MS[attempt]);
        }
        continue;
      }
      return result;
    }
    return fail(lastFailure as DomainError);
  }

  /**
   * Procesa un lote dentro de la transacción gestionada por el adapter
   * (advisory lock + selección + evaluación + delete + métricas de resultado).
   * Las métricas se registran tras el commit para reflejar el estado
   * confirmado de forma consistente. Devuelve `Result`; el `Failure` del
   * adapter se propaga tal cual sin filtrar metadatos.
   */
  private async processBatch(
    now: Date,
    retentionCutoff: Date,
    minimumAgeCutoff: Date,
  ): Promise<
    Result<
      { readonly deleted: number; readonly hasMore: boolean },
      DomainError
    >
  > {
    const evaluate = async (candidate: {
      id: string;
      scope: string;
      createdAt: Date;
      activationExpiresAt: Date | null;
    }) => {
      // Clasificación exclusiva por candidato (ADR-018 addendum / Master Spec
      // §Corrección MSF-ID-002), evaluada en orden de precedencia:
      // 1. Protección defensiva mínima: nunca borrar antes de 24 horas.
      if (candidate.createdAt >= minimumAgeCutoff) {
        return 'minimum_age_not_elapsed' as const;
      }
      // 2. Dentro de la retención de 30 días: `replay_active` si la expiración
      //    específica definida por política (`activation_expires_at`) no ha
      //    vencido o no existe; bloquea la purga.
      // 3. `retention_not_elapsed` es la razón general residual: sigue dentro
      //    de los 30 días pero la expiración específica ya venció, por lo que
      //    el replay ya no es vigente. No crea una ventana ni conducta nueva.
      if (candidate.createdAt >= retentionCutoff) {
        const specificExpirationExpired =
          candidate.activationExpiresAt !== null &&
          candidate.activationExpiresAt.getTime() <= now.getTime();
        return specificExpirationExpired
          ? ('retention_not_elapsed' as const)
          : ('replay_active' as const);
      }
      // 4. Fuera de retención: operación asociada pendiente o scope desconocido.
      if (await this.scopeEvaluator.hasPendingOperation(candidate.scope)) {
        return 'operation_pending' as const;
      }
      // 5. Fuera de retención, sin replay vigente y scope terminal: elegible.
      return 'eligible' as const;
    };

    const result = await this.repo.purgeBatch(
      now,
      minimumAgeCutoff,
      BATCH_SIZE,
      evaluate,
    );

    // El `Failure` del adapter se propaga sin filtrar metadatos.
    if (isFailure(result)) {
      return result;
    }

    const batch = result.value;

    // Métricas de resultado tras el commit (consistentes con el estado real).
    for (const [reason, count] of Object.entries(batch.skipped)) {
      if (count > 0) {
        this.metrics.recordSkipped(
          reason as Parameters<PurgeMetricsPort['recordSkipped']>[0],
          count,
        );
      }
    }
    if (batch.deleted > 0) {
      this.metrics.recordDeleted(batch.deleted);
    }

    return ok({ deleted: batch.deleted, hasMore: batch.hasMore });
  }
}
