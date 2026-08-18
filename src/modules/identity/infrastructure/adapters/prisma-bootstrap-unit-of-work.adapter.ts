import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import {
  BootstrapUnitOfWorkPort,
  BootstrapTransaction,
} from '../../domain/ports/bootstrap-unit-of-work.port';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaService } from '../prisma.service';

/**
 * Adapter de unidad de trabajo de bootstrap del admin inicial (Prisma).
 *
 * Implementa la frontera transaccional real de ADR-010: una única transacción
 * PostgreSQL que valida (relee) y crea el admin inicial de forma atómica, con
 * rollback total ante fallo. No lleva Prisma al dominio/aplicación: expone
 * únicamente el puerto `BootstrapUnitOfWorkPort`.
 *
 * Traduce los fallos técnicos en su límite (Master Spec §ROP): captura la
 * excepción, registra solo el código Prisma (nunca el mensaje, que puede
 * contener PII, ni secretos) y devuelve `fail(technicalFailure())` sin
 * propagar la causa. La aplicación nunca captura excepciones técnicas.
 */
@Injectable()
export class PrismaBootstrapUnitOfWorkAdapter
  implements BootstrapUnitOfWorkPort
{
  private readonly logger = new Logger(PrismaBootstrapUnitOfWorkAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    work: (tx: BootstrapTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>> {
    try {
      const value = await this.prisma.$transaction(async (tx) => {
        const transaction: BootstrapTransaction = {
          userRepo: new PrismaUserRepositoryAdapter(tx),
        };
        return await work(transaction);
      });
      return ok(value);
    } catch (error) {
      // Logging interno sanitizado: solo el código Prisma, nunca el mensaje
      // (que puede contener PII) ni secretos.
      const code = (error as { code?: string }).code;
      this.logger.warn(
        `Bootstrap transaction failed (code=${code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}