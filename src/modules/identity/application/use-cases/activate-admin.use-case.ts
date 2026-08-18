import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { AdminActivationTokenRepositoryPort } from '../../domain/ports/admin-activation-token-repository.port';
import { ActivateAdminUnitOfWorkPort } from '../../domain/ports/activate-admin-unit-of-work.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import {
  activationTokenInvalidOrExpired,
  technicalFailure,
} from '../../domain/identity-errors';

/** Comando de entrada del caso de uso de activación de admin. */
export interface ActivateAdminCommand {
  readonly token: string;
  readonly newPassword: string;
}

interface ActivateAdminUseCasePorts {
  readonly activationTokenRepo: AdminActivationTokenRepositoryPort;
  readonly unitOfWork: ActivateAdminUnitOfWorkPort;
  readonly passwordHasher: PasswordHasherPort;
  readonly cookieToken: CookieTokenPort;
  readonly clock: ClockPort;
}

/**
 * Caso de uso de activación de admin (MSF-ID-002).
 * Consume atómicamente un token opaco, establece contraseña inicial y revoca sesiones.
 * OpenAPI 204: no devuelve cuerpo.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class ActivateAdminUseCase {
  constructor(private readonly ports: ActivateAdminUseCasePorts) {}

  async execute(
    command: ActivateAdminCommand,
  ): Promise<Result<void, DomainError>> {
    // 1. Hashea el token recibido antes de buscar (nunca busca en claro)
    const tokenHash = this.ports.cookieToken.hash(command.token);

    // 2. Búsqueda del token por hash (lectura fuera de transacción)
    const now = this.ports.clock.now();
    const tokenRecord = await this.ports.activationTokenRepo.findByTokenHash(
      tokenHash,
    );
    if (
      !tokenRecord ||
      tokenRecord.usedAt !== null ||
      tokenRecord.expiresAt <= now
    ) {
      return fail(activationTokenInvalidOrExpired());
    }

    // 3. Hashea la nueva contraseña fuera de la transacción (Argon2id)
    const hashResult = await this.ports.passwordHasher.hash(
      command.newPassword,
    );
    if (isFailure(hashResult)) return hashResult;
    const hashedPassword = hashResult.value;

    // 4. Unidad transaccional: consume token + set password + revoke otras sesiones
    const uowResult = await this.ports.unitOfWork.run(async (tx) => {
      const consumed = await tx.activationTokenRepo.consumeUnused(
        tokenRecord.id,
        now,
      );
      if (!consumed) {
        return { ok: false as const };
      }
      await tx.userRepo.updatePassword(
        tokenRecord.userId,
        hashedPassword,
      );
      await tx.sessionRepo.revokeAllForUser(tokenRecord.userId);
      return { ok: true as const, userId: tokenRecord.userId };
    });

    if (isFailure(uowResult)) {
      return fail(uowResult.error);
    }
    if (!uowResult.value.ok) {
      return fail(activationTokenInvalidOrExpired());
    }

    // OpenAPI 204: void — no devuelve cuerpo
    return ok(undefined);
  }
}
