import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import {
  sessionNotFoundOrExpired,
  technicalFailure,
} from '../../domain/identity-errors';
import type { SessionDto } from '../../../../contract/application/dto';

/** Comando de entrada del caso de uso de refresh. */
export interface RefreshSessionCommand {
  /** Refresh token en claro (extraído de la cookie). */
  readonly refreshToken: string;
}

/** Resultado de éxito del refresh. */
export interface RefreshSessionResult {
  readonly session: SessionDto;
  readonly refreshToken: string;
}

/** Duración de sesión en ms (10 minutos). */
const SESSION_DURATION_MS = 10 * 60 * 1000;

/**
 * Caso de uso de refresh de sesión (MSF-ID-001).
 *
 * Rota la cookie de refresh token HttpOnly: valida el token actual,
 * genera uno nuevo, actualiza el hash en la sesión y emite un nuevo
 * JWT de acceso.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly sessionRepo: SessionRepositoryPort,
    private readonly userRepo: UserRepositoryPort,
    private readonly jwt: JwtPort,
    private readonly cookieToken: CookieTokenPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    command: RefreshSessionCommand,
  ): Promise<Result<RefreshSessionResult, DomainError>> {
    // 1. Hashear el refresh token recibido
    const tokenHash = this.cookieToken.hash(command.refreshToken);

    // 2. Buscar sesión por hash
    const sessionResult = await this.sessionRepo.findByRefreshTokenHash(tokenHash);
    if (isFailure(sessionResult)) return sessionResult;
    const session = sessionResult.value;

    if (!session || session.revokedAt) {
      return fail(sessionNotFoundOrExpired());
    }

    // 3. Verificar expiración
    const now = this.clock.now();
    if (session.expiresAt <= now) {
      return fail(sessionNotFoundOrExpired());
    }

    // 4. Verificar que el usuario existe (para sesiones autenticadas)
    if (session.userId) {
      const userResult = await this.userRepo.findById(session.userId);
      if (isFailure(userResult)) return userResult;
      const user = userResult.value;

      if (!user) {
        return fail(sessionNotFoundOrExpired());
      }

      // 5. Rotar refresh token
      const newRefreshToken = this.cookieToken.generate();
      const newRefreshTokenHash = this.cookieToken.hash(newRefreshToken);
      const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

      const rotateResult = await this.sessionRepo.rotateRefreshToken(
        session.id,
        newRefreshTokenHash,
        newExpiresAt,
      );
      if (isFailure(rotateResult)) return rotateResult;

      // 6. Generar nuevo JWT
      const jwtResult = await this.jwt.sign({
        sub: user.id,
        session_id: session.id,
        role: user.role,
      });
      if (isFailure(jwtResult)) return jwtResult;

      return ok({
        session: {
          access_token: jwtResult.value,
          expires_at: newExpiresAt.toISOString(),
          user: {
            id: user.id,
            display_name: user.displayName,
            email: user.email,
            role: user.role,
            must_change_password: user.mustChangePassword,
            phone: user.phone,
          },
        },
        refreshToken: newRefreshToken,
      });
    }

    // Sesión guest sin usuario: no se puede refrescar con JWT
    return fail(sessionNotFoundOrExpired());
  }
}
