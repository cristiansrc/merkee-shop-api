import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  RequestPasswordResetUnitOfWorkPort,
  RequestPasswordResetTransaction,
} from '../../domain/ports/request-password-reset-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaPasswordResetTokenRepositoryAdapter } from './prisma-password-reset-token-repository.adapter';

/**
 * Adapter de unidad de trabajo para solicitud de restablecimiento de contraseña.
 *
 * Ejecuta el callback `work` dentro de una única transacción PostgreSQL
 * donde `userRepo` y `passwordResetTokenRepo` operan sobre la misma
 * transacción. La aplicación no conoce Prisma: solo invoca el caso
 * de uso y recibe el `Result<void, DomainError>`. Las excepciones técnicas se
 * capturan en el límite del adapter, se registran sin causa/PII y se traducen
 * a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 *
 * Si el callback lanza un `DomainError`, se propaga como `Failure`.
 *
 * Garantía de atomicidad: invalidación de tokens anteriores + creación
 * del nuevo token ocurren en la misma transacción; si cualquiera falla,
 * ambas operaciones se revierten (rollback total).
 */
@Injectable()
export class PrismaRequestPasswordResetUnitOfWorkAdapter
  implements RequestPasswordResetUnitOfWorkPort
{
  private readonly logger = new Logger(
    PrismaRequestPasswordResetUnitOfWorkAdapter.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async run(
    work: (tx: RequestPasswordResetTransaction) => Promise<void>,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const transaction: RequestPasswordResetTransaction = {
            userRepo: new PrismaUserRepositoryAdapter(tx),
            passwordResetTokenRepo:
              new PrismaPasswordResetTokenRepositoryAdapter(tx),
          };
          await work(transaction);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return ok(undefined);
    } catch (error) {
      // Si es un DomainError lanzado por el callback, propagarlo como Failure.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'kind' in error &&
        'messageKey' in error
      ) {
        return fail(error as DomainError);
      }
      // Error técnico inesperado — registrar solo el código Prisma, sin causa/PII.
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Request password reset transaction failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}
