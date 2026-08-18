import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  ActivateAdminUnitOfWorkPort,
  ActivateAdminTransaction,
} from '../../domain/ports/activate-admin-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaSessionRepositoryAdapter } from './prisma-session-repository.adapter';
import { PrismaAdminActivationTokenRepositoryAdapter } from './prisma-admin-activation-token-repository.adapter';
import { PrismaService } from '../prisma.service';

/**
 * Adapter de unidad de trabajo de activación de admin (Prisma).
 *
 * Implementa la frontera transaccional real de la activación de admin: una
 * única transacción PostgreSQL que consume el token de activación
 * (`used_at IS NULL AND expires_at > now()`), actualiza `password_hash` y
 * `must_change_password` y revoca las demás sesiones del admin de forma
 * atómica. Si el callback lanza, Prisma revierte todo (rollback total).
 *
 * No lleva Prisma al dominio/aplicación: expone únicamente el puerto
 * `ActivateAdminUnitOfWorkPort`.
 */
@Injectable()
export class PrismaActivateAdminUnitOfWorkAdapter
  implements ActivateAdminUnitOfWorkPort
{
  private readonly logger = new Logger(PrismaActivateAdminUnitOfWorkAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    work: (tx: ActivateAdminTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>> {
    try {
      const value = await this.prisma.$transaction(async (tx) => {
        const transaction: ActivateAdminTransaction = {
          userRepo: new PrismaUserRepositoryAdapter(tx),
          sessionRepo: new PrismaSessionRepositoryAdapter(tx),
          activationTokenRepo: new PrismaAdminActivationTokenRepositoryAdapter(tx),
        };
        return await work(transaction);
      });
      return ok(value);
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Activate admin transaction failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}
