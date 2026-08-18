import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { emailAlreadyRegistered, technicalFailure } from '../../domain/identity-errors';
import type { SessionDto } from '../../../../contract/application/dto';

/** Comando de entrada del caso de uso de registro. */
export interface RegisterCommand {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
  readonly phone?: string;
}

/** Resultado de éxito del registro. */
export interface RegisterResult {
  readonly session: SessionDto;
  readonly refreshToken: string;
}

/** Duración de sesión en ms (10 minutos). */
const SESSION_DURATION_MS = 10 * 60 * 1000;

/**
 * Caso de uso de registro público de cliente (MSF-ID-001).
 *
 * Crea un usuario con rol `cliente`, una sesión AUTHENTICATED, un JWT
 * de acceso (≤10 min) y un refresh token opaco hashado.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class RegisterUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly sessionRepo: SessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly jwt: JwtPort,
    private readonly cookieToken: CookieTokenPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    command: RegisterCommand,
  ): Promise<Result<RegisterResult, DomainError>> {
    const normalizedEmail = command.email.toLowerCase().trim();

    // 1. Verificar que el email no esté registrado
    const existingResult = await this.userRepo.findByEmail(normalizedEmail);
    if (isFailure(existingResult)) return existingResult;
    if (existingResult.value) {
      return fail(emailAlreadyRegistered());
    }

    // 2. Hashear contraseña con Argon2id
    const hashResult = await this.passwordHasher.hash(command.password);
    if (isFailure(hashResult)) return hashResult;

    // 3. Crear usuario con rol `cliente`
    const displayName =
      command.displayName?.trim() || normalizedEmail.split('@')[0];
    const createResult = await this.userRepo.create({
      email: normalizedEmail,
      passwordHash: hashResult.value,
      displayName,
      phone: command.phone?.trim() || null,
      role: 'cliente',
    });
    if (isFailure(createResult)) return createResult;

    // 4. Crear sesión AUTHENTICATED
    const refreshToken = this.cookieToken.generate();
    const refreshTokenHash = this.cookieToken.hash(refreshToken);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    const sessionResult = await this.sessionRepo.create({
      userId: createResult.value.id,
      sessionKind: 'AUTHENTICATED',
      refreshTokenHash,
      expiresAt,
    });
    if (isFailure(sessionResult)) return sessionResult;

    // 5. Generar JWT de acceso
    const jwtResult = await this.jwt.sign({
      sub: createResult.value.id,
      session_id: sessionResult.value.id,
      role: createResult.value.role,
    });
    if (isFailure(jwtResult)) return jwtResult;

    return ok({
      session: {
        access_token: jwtResult.value,
        expires_at: expiresAt.toISOString(),
        user: {
          id: createResult.value.id,
          display_name: createResult.value.displayName,
          email: createResult.value.email,
          role: createResult.value.role,
          must_change_password: createResult.value.mustChangePassword,
          phone: createResult.value.phone,
        },
      },
      refreshToken,
    });
  }
}
