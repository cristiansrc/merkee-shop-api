import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import {
  invalidCredentials,
  technicalFailure,
} from '../../domain/identity-errors';
import { SESSION_INACTIVITY_TTL_MS } from '../../domain/session.config';
import type { SessionDto } from '../../../../contract/application/dto';

/** Comando de entrada del caso de uso de login. */
export interface LoginCommand {
  readonly email: string;
  readonly password: string;
  /** ID de sesión guest previa (si existe cookie de carrito). */
  readonly guestSessionId?: string;
}

/** Resultado de éxito del login. */
export interface LoginResult {
  readonly session: SessionDto;
  readonly refreshToken: string;
}

/**
 * Caso de uso de login con email/password (MSF-ID-001).
 *
 * Autentica al usuario, maneja la promoción guest→cliente (conserva
 * carrito) y guest→admin (libera reservas ACTIVE, cierra carrito, no
 * crea carrito admin). Las credenciales inválidas devuelven un error
 * neutro sin revelar si el email existe.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class LoginUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly sessionRepo: SessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly jwt: JwtPort,
    private readonly cookieToken: CookieTokenPort,
    private readonly clock: ClockPort,
    private readonly cartReservation: CartReservationPort,
  ) {}

  async execute(
    command: LoginCommand,
  ): Promise<Result<LoginResult, DomainError>> {
    const normalizedEmail = command.email.toLowerCase().trim();

    // 1. Buscar usuario por email
    const userResult = await this.userRepo.findByEmail(normalizedEmail);
    if (isFailure(userResult)) return userResult;
    if (!userResult.value) {
      return fail(invalidCredentials());
    }
    const user = userResult.value;

    // 2. Verificar contraseña
    const verifyResult = await this.passwordHasher.verify(
      command.password,
      user.passwordHash,
    );
    if (isFailure(verifyResult)) return verifyResult;
    if (!verifyResult.value) {
      return fail(invalidCredentials());
    }

    // 3. Manejar promoción de sesión guest si existe
    if (command.guestSessionId) {
      const guestSessionResult = await this.sessionRepo.findById(command.guestSessionId);
      if (isFailure(guestSessionResult)) return guestSessionResult;
      const guestSession = guestSessionResult.value;

      if (guestSession && !guestSession.revokedAt) {
        if (user.role === 'admin') {
          // guest→admin: liberar reservas ACTIVE, cerrar carrito, revocar guest
          const releaseResult = await this.cartReservation.releaseActiveReservations(
            guestSession.id,
          );
          if (isFailure(releaseResult)) return releaseResult;

          const closeResult = await this.cartReservation.closeCart(guestSession.id);
          if (isFailure(closeResult)) return closeResult;
        }
        // guest→cliente: el carrito se conserva (la sesión guest se
        // reemplaza por la autenticada; el módulo cart-reservation
        // manejará la transferencia de ownership en MSF-CART-001).
        const revokeResult = await this.sessionRepo.revoke(guestSession.id);
        if (isFailure(revokeResult)) return revokeResult;
      }
    }

    // 4. Crear sesión AUTHENTICATED
    const refreshToken = this.cookieToken.generate();
    const refreshTokenHash = this.cookieToken.hash(refreshToken);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_TTL_MS);

    const sessionResult = await this.sessionRepo.create({
      userId: user.id,
      sessionKind: 'AUTHENTICATED',
      refreshTokenHash,
      expiresAt,
    });
    if (isFailure(sessionResult)) return sessionResult;

    // 5. Generar JWT de acceso
    const jwtResult = await this.jwt.sign({
      sub: user.id,
      session_id: sessionResult.value.id,
      role: user.role,
    });
    if (isFailure(jwtResult)) return jwtResult;

    return ok({
      session: {
        access_token: jwtResult.value,
        expires_at: expiresAt.toISOString(),
        user: {
          id: user.id,
          display_name: user.displayName,
          email: user.email,
          role: user.role,
          must_change_password: user.mustChangePassword,
          phone: user.phone,
        },
      },
      refreshToken,
    });
  }
}
