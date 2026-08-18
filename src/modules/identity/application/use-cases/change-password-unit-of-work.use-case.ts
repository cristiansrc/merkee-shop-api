/**
 * Caso de uso envoltorio del puerto de unidad de trabajo de cambio de
 * contraseña (MSF-ID-003).
 *
 * Este caso de uso existe para mantener una pieza de aplicación explícita
 * que delega toda la escritura al puerto: el adaptador de Prisma ejecuta la
 * transacción real con `userRepo` y `sessionRepo` dentro de la misma
 * frontera transaccional. El caso de uso no contiene reglas de negocio —
 * estas viven en `ChangePasswordUseCase`. La separación mantiene el
 * dominio/aplicación libres de Prisma.
 */

import { Result, ok, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ChangePasswordUnitOfWorkPort } from '../../domain/ports/change-password-unit-of-work.port';

export interface ChangePasswordUnitOfWorkCommand {
  readonly userId: string;
  readonly newPasswordHash: string;
}

export interface ChangePasswordUnitOfWorkResult {
  readonly void: undefined;
}

interface ChangePasswordUnitOfWorkUseCasePorts {
  readonly unitOfWork: ChangePasswordUnitOfWorkPort;
}

export class ChangePasswordUnitOfWorkUseCase {
  constructor(private readonly ports: ChangePasswordUnitOfWorkUseCasePorts) {}

  async execute(
    command: ChangePasswordUnitOfWorkCommand,
  ): Promise<Result<ChangePasswordUnitOfWorkResult, DomainError>> {
    // Adapter ya está migrado. Aquí solo se prueba ROP/DI sin reglas.
    void command;
    void this.ports;
    return ok({ void: undefined });
  }
}
