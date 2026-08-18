import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { PasswordResetTokenRepositoryPort } from '../../domain/ports/password-reset-token-repository.port';
import { ResetPasswordUnitOfWorkPort } from '../../domain/ports/reset-password-unit-of-work.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { passwordResetTokenInvalidOrExpired } from '../../domain/identity-errors';

/** Commando de entrada para restablecer la contraseña. */
export interface ResetPasswordCommand {
  readonly token: string;
  readonly newPassword: string;
}

/**
 * Caso de uso: Consumir token de restablecimiento y cambiar contraseña
 * (POST /auth/password-resets).
 *
 * Consume el token de forma atómica (una sola vez y no expirado), hashea
 * la nueva contraseña con Argon2id, revoca todas las sesiones del usuario
 * y devuelve 204.
 *
 * Reglas:
 * - Token hasheado y búsqueda por hash en DB.
 * - Consumo atómico: si el token ya fue usado o expiró → 422 neutro.
 * - Hash de nueva contraseña con Argon2id (calculado fuera de la transacción).
 * - Revoca TODAS las sesiones del usuario (no conserva ninguna).
 * - Respuesta 204 (sin Set-Cookie en reset).
 * - Sin filtrar estado: token inválido/expirado/usado → mismo 422.
 * - ROP: no contiene try/catch técnico; las excepciones se capturan en adapters.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly passwordResetTokenRepo: PasswordResetTokenRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly clock: ClockPort,
    private readonly cookieToken: CookieTokenPort,
    private readonly unitOfWork: ResetPasswordUnitOfWorkPort,
  ) {}

  async execute(
    command: ResetPasswordCommand,
  ): Promise<Result<void, DomainError>> {
    const now = this.clock.now();

    // Hashea el token recibido para buscar en DB.
    const tokenHash = this.cookieToken.hash(command.token);

    // Busca el token por hash.
    const tokenRecord =
      await this.passwordResetTokenRepo.findByTokenHash(tokenHash);

    // Token no encontrado → 422 neutro.
    if (!tokenRecord) {
      return fail(passwordResetTokenInvalidOrExpired());
    }

    // Token ya usado → 422 neutro (mismo error, no revela estado).
    if (tokenRecord.usedAt) {
      return fail(passwordResetTokenInvalidOrExpired());
    }

    // Token expirado → 422 neutro.
    if (tokenRecord.expiresAt.getTime() <= now.getTime()) {
      return fail(passwordResetTokenInvalidOrExpired());
    }

    // Hashea la nueva contraseña (fuera de la transacción, cómputo puro).
    const hashResult = await this.passwordHasher.hash(
      command.newPassword,
    );
    if (isFailure(hashResult)) return hashResult;
    const newPasswordHash = hashResult.value;

    // Ejecuta la transacción atómica: consumo token + cambio password + revocación sesiones.
    const result = await this.unitOfWork.run(async (tx) => {
      // Marca el token como usado (consumo atómico).
      // Pasa `now` para que el adapter verifique `expiresAt > now` en la misma transacción.
      const consumed = await tx.passwordResetTokenRepo.markAsUsed(
        tokenRecord.id,
        now,
      );

      // Si no se pudo consumir (carrera), devuelve Failure (rollback automático).
      if (!consumed) {
        return fail(passwordResetTokenInvalidOrExpired());
      }

      // Cambia la contraseña del usuario.
      await tx.userRepo.updatePassword(
        tokenRecord.userId,
        newPasswordHash,
      );

      // Revoca TODAS las sesiones del usuario.
      await tx.sessionRepo.revokeAllForUser(tokenRecord.userId);

      return ok(undefined);
    });

    return result;
  }
}
