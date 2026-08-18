import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { PurgeSkipReason } from './purge-metrics.port';

/**
 * Puerto de salida de repositorio de purga de `idempotency_records`.
 *
 * Abstrae la selección, evaluación y eliminación de registros de idempotencia
 * elegibles por retención dentro de una única transacción PostgreSQL
 * `READ COMMITTED`. La implementación concreta (Prisma) vive en infrastructure.
 * No expone PII: los candidatos solo llevan `id`, `scope`, `created_at` y la
 * expiración específica del snapshot (`activation_expires_at`), sin datos
 * personales.
 */
export interface PurgeCandidate {
  readonly id: string;
  readonly scope: string;
  readonly createdAt: Date;
  /**
   * Expiración específica definida por política para el registro
   * (`response_json.activation_expires_at`), o `null` si no existe. Distingue
   * `replay_active` (expiración no vencida o ausente) de `retention_not_elapsed`
   * (expiración específica ya vencida dentro de la retención de 30 días).
   */
  readonly activationExpiresAt: Date | null;
}

/**
 * Clasificación exclusiva de un candidato dentro de la transacción de purga.
 *
 * Cada candidato recibe exactamente una clasificación con la precedencia
 * documentada (ADR-018 addendum / Master Spec §Corrección MSF-ID-002):
 * `minimum_age_not_elapsed` → `replay_active` → `retention_not_elapsed` →
 * `operation_pending` → `eligible`. Las razones de skip bloquean la purga;
 * `eligible` es la clasificación explícita que autoriza el borrado (no es una
 * razón de skip y no se cuenta en `skipped`).
 */
export type PurgeClassification = PurgeSkipReason | 'eligible';

/**
 * Evaluador de un candidato dentro de la transacción de purga.
 *
 * Devuelve la clasificación exclusiva del candidato. La lógica de
 * retención/antigüedad/replay/operación pendiente la decide el caso de uso
 * (dominio); el adapter solo la invoca dentro de la frontera transaccional y
 * borra únicamente los clasificados como `eligible`.
 */
export type PurgeEvaluation = (
  candidate: PurgeCandidate,
) => Promise<PurgeClassification>;

/** Resultado de un batch de purga (métricas de resultado, sin PII). */
export interface PurgeBatchResult {
  /** Número de filas eliminadas en el batch. */
  readonly deleted: number;
  /** `true` si el batch devolvió el máximo (puede haber más filas). */
  readonly hasMore: boolean;
  /** Contadores de skip por razón (sin PII). */
  readonly skipped: Readonly<Record<PurgeSkipReason, number>>;
}

export interface IdempotencyPurgeRepositoryPort {
  /**
   * Procesa un batch completo dentro de una única transacción PostgreSQL
   * `READ COMMITTED` que cubre de forma consistente: advisory lock transaccional
   * (exclusión distribuida), selección de hasta `limit` filas (`created_at < now`)
   * usando `FOR UPDATE SKIP LOCKED`, evaluación de cada candidato con `evaluate`
   * y eliminación atómica de los elegibles. La selección no filtra antes las
   * filas necesarias: incluye registros <24 h, 24 h–30 d y >30 d para que la
   * evaluación alcance `minimum_age_not_elapsed`, `replay_active` y eligible
   * (>30 d) sin dejar registros elegibles sin purgar. `minimumAgeCutoff` se
   * conserva como referencia del límite de 24 h (lo usa el evaluador del caso de
   * uso), pero la selección parte de `now`. Si algo falla, la transacción se
   * revierte íntegramente (rollback total) y el caso de uso reintenta.
   *
   * Devuelve `Result<PurgeBatchResult, DomainError>`: la traducción de
   * excepciones técnicas a `DomainError` ocurre en el límite del adapter
   * (Master Spec §ROP) sin propagar la causa ni PII al caso de uso.
   */
  purgeBatch(
    now: Date,
    minimumAgeCutoff: Date,
    limit: number,
    evaluate: PurgeEvaluation,
  ): Promise<Result<PurgeBatchResult, DomainError>>;
}
