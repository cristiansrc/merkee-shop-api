import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  UpdateProfileUnitOfWorkPort,
  UpdateProfileTransaction,
} from '../../domain/ports/update-profile-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaIdempotencyAdapter } from './prisma-idempotency.adapter';

/**
 * Adapter de unidad de trabajo para actualización de perfil (MSF-ID-003).
 *
 * Ejecuta el callback `work` dentro de una única transacción PostgreSQL
 * donde `userRepo` e `idempotency` operan sobre la misma transacción. La
 * aplicación no conoce Prisma: solo invoca el caso de uso y recibe el
 * `Result<T, DomainError>`. Las excepciones técnicas se capturan en el
 * límite del adapter, se registran sin causa/PII y se traducen a
 * `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 */
@Injectable()
export class PrismaUpdateProfileUnitOfWorkAdapter
  implements UpdateProfileUnitOfWorkPort
{
  private readonly logger = new Logger(
    PrismaUpdateProfileUnitOfWorkAdapter.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    work: (tx: UpdateProfileTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>> {
    try {
      const value = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const transaction: UpdateProfileTransaction = {
            userRepo: new PrismaUserRepositoryAdapter(tx),
            idempotency: new PrismaIdempotencyAdapter(tx),
          };
          return await work(transaction);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return ok(value);
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Update profile transaction failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}
