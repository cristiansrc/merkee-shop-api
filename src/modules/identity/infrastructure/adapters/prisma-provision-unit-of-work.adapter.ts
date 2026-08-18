import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  ProvisionUnitOfWorkPort,
  ProvisionTransaction,
} from '../../domain/ports/provision-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaAdminActivationTokenRepositoryAdapter } from './prisma-admin-activation-token-repository.adapter';
import { PrismaIdempotencyAdapter } from './prisma-idempotency.adapter';

/** Delays de reintento de serialización (ms): 50, 100, 200. */
const RETRY_DELAYS_MS = [50, 100, 200] as const;
/** Máximo de reintentos de transacción. */
const MAX_RETRIES = 3;

/**
 * Construye un lock ID decimal para `pg_advisory_xact_lock` derivado de
 * SHA-256(scope || 0x00 || key). Toma los primeros 8 bytes del hash y los
 * convierte a un entero con signo de 64 bits como string decimal.
 */
function deriveAdvisoryLockId(scope: string, key: string): string {
  const input = Buffer.concat([
    Buffer.from(scope, 'utf8'),
    Buffer.from([0x00]),
    Buffer.from(key, 'utf8'),
  ]);
  const hash = createHash('sha256').update(input).digest();
  // Primeros 8 bytes → entero con signo de 64 bits (big-endian)
  const high = hash.readUInt32BE(0);
  const low = hash.readUInt32BE(4);
  const lockId = high * 0x100000000 + low;
  return String(lockId);
}

/**
 * Evalúa si un error Prisma es reintentable en el contexto de provisión:
 * - P2034: aborto de transacción por serialización → siempre reintentar.
 * - P2002: conflicto de unicidad → solo reintentar si el target corresponde
 *   a la constraint de idempotencia `(scope, idempotency_key)`.
 */
function isRetryablePrismaError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code === 'P2034') return true;
  if (code === 'P2002') {
    const target = (error as { meta?: { target?: string | string[] } }).meta
      ?.target;
    if (typeof target === 'string') {
      return target.includes('scope') && target.includes('idempotency_key');
    }
    if (Array.isArray(target)) {
      return (
        target.includes('scope') && target.includes('idempotency_key')
      );
    }
  }
  return false;
}

/**
 * Adapter de unidad de trabajo de provisión de admin (MSF-ID-002 / ADR-018).
 *
 * Ejecuta el callback `work` dentro de una transacción PostgreSQL con
 * `SERIALIZABLE` isolation level, advisory lock transaccional derivado de
 * `SHA-256(scope || 0x00 || key)`, y hasta 3 reintentos ante aborto de
 * serialización (P2034) o conflicto de unicidad de idempotencia (P2002).
 * Captura excepciones técnicas en su límite, las registra sin PII/causa y
 * las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 */
@Injectable()
export class PrismaProvisionUnitOfWorkAdapter
  implements ProvisionUnitOfWorkPort
{
  private readonly logger = new Logger(PrismaProvisionUnitOfWorkAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    scope: string,
    idempotencyKey: string,
    work: (tx: ProvisionTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>> {
    const lockId = deriveAdvisoryLockId(scope, idempotencyKey);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const value = await this.prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // Advisory lock transaccional
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

            const transaction: ProvisionTransaction = {
              scope,
              idempotencyKey,
              userRepo: new PrismaUserRepositoryAdapter(tx),
              activationTokenRepo:
                new PrismaAdminActivationTokenRepositoryAdapter(tx),
              idempotencyRepo: new PrismaIdempotencyAdapter(tx),
            };
            return await work(transaction);
          },
          { isolationLevel: 'Serializable' },
        );
        return ok(value);
      } catch (error) {
        const code = (error as { code?: string }).code;

        if (isRetryablePrismaError(error) && attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[2];
          this.logger.warn(
            `Provision transaction retryable (scope=${scope}, code=${code}, attempt=${attempt + 1}/${MAX_RETRIES}, delay=${delay}ms)`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        this.logger.warn(
          `Provision unit-of-work failed (scope=${scope}, code=${code ?? 'unknown'})`,
        );
        return fail(technicalFailure());
      }
    }

    // Nunca se alcanza (for loop agota MAX_RETRIES o retorna), pero TypeScript no lo sabe
    return fail(technicalFailure());
  }
}
