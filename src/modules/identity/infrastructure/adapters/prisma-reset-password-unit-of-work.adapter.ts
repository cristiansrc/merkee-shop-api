import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  ResetPasswordUnitOfWorkPort,
  ResetPasswordTransaction,
} from '../../domain/ports/reset-password-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaSessionRepositoryAdapter } from './prisma-session-repository.adapter';
import { PrismaPasswordResetTokenRepositoryAdapter } from './prisma-password-reset-token-repository.adapter';

/**
 * Adapter de unidad de trabajo para restablecimiento de contraseña.
 *
 * Ejecuta el callback `work` dentro de una única transacción PostgreSQL
 * donde `userRepo`, `sessionRepo` y `passwordResetTokenRepo` operan sobre
 * la misma transacción. La aplicación no conoce Prisma: solo invoca el caso
 * de uso y recibe el `Result<T, DomainError>`. Las excepciones técnicas se
 * capturan en el límite del adapter, se registran sin causa/PII y se traducen
 * a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 *
 * Si el callback lanza un `DomainError`, se propaga como `Failure`.
 */
@Injectable()
export class PrismaResetPasswordUnitOfWorkAdapter
  implements ResetPasswordUnitOfWorkPort
{
  private readonly logger = new Logger(
    PrismaResetPasswordUnitOfWorkAdapter.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async run(
    work: (tx: ResetPasswordTransaction) => Promise<Result<void, DomainError>>,
  ): Promise<Result<void, DomainError>> {
    try {
      const result = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const transaction: ResetPasswordTransaction = {
            userRepo: new PrismaUserRepositoryAdapter(tx),
            sessionRepo: new PrismaSessionRepositoryAdapter(tx),
            passwordResetTokenRepo:
              new PrismaPasswordResetTokenRepositoryAdapter(tx),
          };
          return await work(transaction);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      // Si el callback devolvió Failure, propagarlo (rollback ya hecho por Prisma).
      if (result && !result.ok) {
        return result;
      }
      return ok(undefined);
    } catch (error) {
      // Error técnico inesperado.
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Reset password transaction failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}
