import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import {
  IdempotencyPurgeRepositoryPort,
  PurgeBatchResult,
  PurgeCandidate,
  PurgeEvaluation,
} from '../../domain/ports/idempotency-purge-repository.port';
import { PurgeSkipReason } from '../../domain/ports/purge-metrics.port';
import { technicalFailure } from '../../domain/identity-errors';
import { PrismaService } from '../prisma.service';

/** Timeout de la transacción de purga (lock y statements): 5 segundos. */
const TRANSACTION_TIMEOUT_MS = 5000;
/**
 * Clave del advisory lock transaccional global de purga (exclusión distribuida).
 * Constante fija: solo un job de purga se ejecuta a la vez en el cluster.
 * Valor ASCII de "MSFID002" como bigint con signo de 64 bits.
 */
const PURGE_ADVISORY_LOCK_KEY = BigInt('0x4D53464944303032');

/**
 * Adapter de repositorio de purga de `idempotency_records` (Prisma).
 *
 * `purgeBatch` ejecuta un batch completo dentro de una única transacción
 * PostgreSQL `READ COMMITTED` que cubre de forma consistente: advisory lock
 * transaccional (exclusión distribuida), selección de hasta `limit` filas con
 * retención vencida (`created_at < now() - 30 days`) usando `FOR UPDATE SKIP
 * LOCKED`, evaluación de cada candidato con el callback `evaluate` y
 * eliminación atómica de los elegibles. El timeout de 5 s (lock y statements)
 * hace que un batch atascado falle rápido y se revierte íntegramente (rollback
 * total); el caso de uso reintenta 1/5/15 s. No expone PII: los candidatos solo
 * llevan `id`, `scope`, `created_at` y `activation_expires_at` (expiración
 * específica del snapshot, sin datos personales), y las métricas de resultado
 * son contadores sin datos personales.
 *
 * Aplica ROP en el límite del adapter (Master Spec §ROP): captura las
 * excepciones técnicas (incluido el rollback de `$transaction`) y las traduce
 * a `fail(technicalFailure())` sin propagar la causa ni PII al caso de uso.
 * El logging interno está sanitizado (solo el código Prisma / mensaje
 * genérico, nunca email/scope/secret).
 */
@Injectable()
export class PrismaIdempotencyPurgeRepositoryAdapter
  implements IdempotencyPurgeRepositoryPort
{
  private readonly logger = new Logger(
    PrismaIdempotencyPurgeRepositoryAdapter.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async purgeBatch(
    now: Date,
    minimumAgeCutoff: Date,
    limit: number,
    evaluate: PurgeEvaluation,
  ): Promise<Result<PurgeBatchResult, DomainError>> {
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Timeout de 5 s para el advisory lock y los statements: un batch
          // atascado falla rápido y la transacción se revierte (rollback total).
          // `SET LOCAL` no acepta parámetros, por eso se inlina el literal.
          await tx.$executeRaw(
            Prisma.raw(
              `SET LOCAL lock_timeout = '${TRANSACTION_TIMEOUT_MS}ms'`,
            ),
          );
          await tx.$executeRaw(
            Prisma.raw(
              `SET LOCAL statement_timeout = '${TRANSACTION_TIMEOUT_MS}ms'`,
            ),
          );

          // Advisory lock transaccional global de purga: exclusión distribuida
          // para que solo un job de purga se ejecute a la vez en el cluster.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PURGE_ADVISORY_LOCK_KEY}::bigint)`;

          // Selección sin filtrar antes las filas necesarias: se seleccionan todos
          // los registros (`created_at < now`) para que la evaluación dentro de la
          // transacción alcance las cinco clasificaciones del contrato —
          // `minimum_age_not_elapsed` (<24 h), `replay_active` (24 h–30 d con
          // expiración específica no vencida), `retention_not_elapsed` (24 h–30 d
          // con expiración específica vencida), `operation_pending` (fuera de
          // retención con scope pendiente/desconocido) y `eligible` (>30 d, sin
          // replay vigente, scope terminal) — sin dejar registros elegibles sin
          // purgar. `ORDER BY created_at ASC` procesa los más antiguos primero
          // (purgables antes que replay/minimum_age). Dos jobs concurrentes no
          // procesan las mismas filas (defensa adicional aunque el advisory lock
          // ya serializa el job completo).
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              scope: string;
              created_at: Date;
              activation_expires_at: string | null;
            }>
          >`
            SELECT id, scope, created_at,
                   response_json->>'activation_expires_at' AS activation_expires_at
            FROM idempotency_records
            WHERE created_at < ${now}
            ORDER BY created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          `;

          const candidates: PurgeCandidate[] = rows.map((row) => ({
            id: row.id,
            scope: row.scope,
            createdAt: row.created_at,
            activationExpiresAt: parseActivationExpiresAt(
              row.activation_expires_at,
            ),
          }));

          const skipped: Record<PurgeSkipReason, number> = {
            retention_not_elapsed: 0,
            minimum_age_not_elapsed: 0,
            replay_active: 0,
            operation_pending: 0,
          };

          const toDelete: string[] = [];
          for (const candidate of candidates) {
            const classification = await evaluate(candidate);
            if (classification === 'eligible') {
              toDelete.push(candidate.id);
            } else {
              skipped[classification] += 1;
            }
          }

          let deleted = 0;
          if (toDelete.length > 0) {
            const result = await tx.idempotencyRecord.deleteMany({
              where: { id: { in: toDelete } },
            });
            deleted = result.count;
          }

          return {
            deleted,
            hasMore: candidates.length >= limit,
            skipped,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      return ok(result);
    } catch (error) {
      // Traducción ROP en el límite del adapter (Master Spec §ROP): nunca se
      // propaga la excepción ni su causa/PII al caso de uso. Solo se loguea
      // el código Prisma sanitizado para diagnóstico interno.
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Idempotency purge batch failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}

/**
 * Parsea `response_json.activation_expires_at` (RFC 3339/date-time) a `Date`.
 *
 * Devuelve `null` si el valor falta o no es un date-time válido: en ese caso
 * el candidato no tiene expiración específica definida y, dentro de la
 * retención de 30 días, clasifica como `replay_active` (no como
 * `retention_not_elapsed`). No expone PII: solo un timestamp.
 */
function parseActivationExpiresAt(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
