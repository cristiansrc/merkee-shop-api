import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { PasswordResetTokenRepositoryPort } from '../../domain/ports/password-reset-token-repository.port';
import { EmailPort } from '../../domain/ports/email.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { RequestPasswordResetUnitOfWorkPort } from '../../domain/ports/request-password-reset-unit-of-work.port';
import { Result, ok, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/** Commando de entrada para solicitar restablecimiento de contraseña. */
export interface RequestPasswordResetCommand {
  readonly email: string;
}

/** Duración del token de reset: 30 minutos. */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Caso de uso: Solicitar restablecimiento de contraseña (POST /auth/password-reset-requests).
 *
 * Siempre devuelve 202 independientemente de si el email existe o no (no revela
 * existencia). Genera un token opaco aleatorio de un solo uso con expiración de
 * 30 minutos, almacena SOLO el hash SHA-256 del token en la BD, invalida el token
 * activo anterior del mismo usuario y envía el email con el token en claro mediante
 * el EmailPort/outbox.
 *
 * Atomicidad: invalidación de tokens anteriores + creación del nuevo token
 * ocurren dentro de una única transacción (`RequestPasswordResetUnitOfWorkPort`).
 * Si cualquiera de las operaciones falla, ambas se revierten (rollback total).
 * El email se envía **después** del commit exitoso de la transacción.
 *
 * ROP: el email falla silenciosamente si el adapter retorna Failure.
 * La respuesta sigue siendo 202 idempotente (no revela estado del envío).
 * El token en claro NUNCA se incluye en el DomainError.
 *
 * Reglas:
 * - Nunca revela si el email existe o no (respuesta neutra 202).
 * - Token opaco de 32 bytes aleatorios, hasheado con SHA-256.
 * - Solo el hash se almacena en `password_reset_tokens`.
 * - Invalida token activo anterior del mismo usuario antes de crear el nuevo.
 * - Email enviado mediante EmailPort (outbox) con el token en claro.
 * - Token en claro NUNCA se loguea, metrica, traza ni expone en response.
 * - ROP: no contiene try/catch técnico; las excepciones se capturan en adapters.
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly passwordResetTokenRepo: PasswordResetTokenRepositoryPort,
    private readonly emailPort: EmailPort,
    private readonly clock: ClockPort,
    private readonly cookieToken: CookieTokenPort,
    private readonly unitOfWork: RequestPasswordResetUnitOfWorkPort,
  ) {}

  async execute(
    command: RequestPasswordResetCommand,
  ): Promise<Result<void, DomainError>> {
    const now = this.clock.now();

    // Busca el usuario por email (case-insensitive).
    const userResult = await this.userRepo.findByEmail(command.email);
    if (isFailure(userResult)) {
      // Si falla la búsqueda, devolvemos 202 igualmente (respuesta neutra).
      return ok(undefined);
    }
    const user = userResult.value;

    // Si el usuario no existe, devolvemos 202 igualmente (respuesta neutra).
    if (user) {
      // Genera token opaco aleatorio y hashea para almacenamiento.
      const tokenClear = this.cookieToken.generate();
      const tokenHash = this.cookieToken.hash(tokenClear);

      // Calcula expiración: 30 minutos desde ahora.
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);

      // Ejecuta la transacción atómica: invalidar tokens anteriores + crear nuevo token.
      const txResult = await this.unitOfWork.run(async (tx) => {
        // Invalida tokens activos anteriores del usuario.
        await tx.passwordResetTokenRepo.invalidateAllActiveForUser(user.id);

        // Almacena el hash del token.
        await tx.passwordResetTokenRepo.create(
          user.id,
          tokenHash,
          expiresAt,
        );
      });

      // Si la transacción falló (token ya creado en carrera, error técnico),
      // propagar el failure sin enviar email.
      if (!txResult.ok) {
        return txResult;
      }

      // Envía email con el token en claro (fuera de la transacción, después del commit).
      // ROP: si el adapter retorna Failure, el email no se envió pero la
      // respuesta sigue siendo 202 (idempotente, no revela estado del envío).
      // El token en claro NUNCA se incluye en el DomainError.
      const emailResult = await this.emailPort.sendPasswordResetEmail(
        user.email,
        tokenClear,
      );
      if (isFailure(emailResult)) {
        // Email falló — pero la solicitud fue procesada correctamente.
        // 202 idempotente: no revelar fallo de envío.
      }
    }

    // Siempre devuelve 202 independientemente de la existencia del email.
    return ok(undefined);
  }
}
