import { RegisterUseCase } from './register.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { User } from '../../domain/models/user';
import { Session } from '../../domain/models/session';
import { isSuccess, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

function stubUserRepo(overrides?: Partial<UserRepositoryPort>): UserRepositoryPort {
  return {
    findByEmail: jest.fn().mockResolvedValue(ok(null)),
    findById: jest.fn().mockResolvedValue(ok(null)),
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve(ok({
        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        phone: data.phone,
        role: data.role,
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    ),
    createAdmin: jest.fn().mockImplementation((data) =>
      Promise.resolve(ok({
        id: 'user-1',
        email: data.email,
        passwordHash: 'placeholder',
        displayName: data.displayName,
        phone: data.phone,
        role: 'admin',
        mustChangePassword: true,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    ),
    updatePassword: jest.fn().mockImplementation((userId, passwordHash) =>
      Promise.resolve(ok({
        id: userId,
        email: 'admin@example.com',
        passwordHash,
        displayName: 'Admin',
        phone: null,
        role: 'admin',
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    ),
    updateProfile: jest.fn().mockResolvedValue(ok({} as User)),
    ...overrides,
  };
}

function stubSessionRepo(overrides?: Partial<SessionRepositoryPort>): SessionRepositoryPort {
  return {
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'session-1',
        userId: data.userId,
        sessionKind: data.sessionKind,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      } satisfies Session)),
    ),
    findById: jest.fn().mockResolvedValue(ok(null)),
    findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(null)),
    rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
    revoke: jest.fn().mockResolvedValue(ok(undefined)),
    revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined)),
    revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
    findActiveByUserId: jest.fn().mockResolvedValue(ok(null)),
    findActiveByUserIdExcluding: jest.fn().mockResolvedValue(ok([])),
    touchActivity: jest.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  };
}

function stubPasswordHasher(overrides?: Partial<PasswordHasherPort>): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue(ok('hashed-password')),
    verify: jest.fn().mockResolvedValue(ok(true)),
    ...overrides,
  };
}

function stubJwt(overrides?: Partial<JwtPort>): JwtPort {
  return {
    sign: jest.fn().mockResolvedValue(ok('jwt-token')),
    verify: jest.fn().mockResolvedValue(ok({ sub: 'user-1', session_id: 'session-1', role: 'cliente' })),
    ...overrides,
  };
}

function stubCookieToken(overrides?: Partial<CookieTokenPort>): CookieTokenPort {
  return {
    generate: jest.fn().mockReturnValue('raw-refresh-token'),
    hash: jest.fn().mockReturnValue('hashed-refresh-token'),
    ...overrides,
  };
}

function stubClock(overrides?: Partial<ClockPort>): ClockPort {
  return {
    now: jest.fn().mockReturnValue(fixedDate),
    ...overrides,
  };
}

function createUseCase(overrides?: {
  userRepo?: Partial<UserRepositoryPort>;
  sessionRepo?: Partial<SessionRepositoryPort>;
  passwordHasher?: Partial<PasswordHasherPort>;
  jwt?: Partial<JwtPort>;
  cookieToken?: Partial<CookieTokenPort>;
  clock?: Partial<ClockPort>;
}): RegisterUseCase {
  return new RegisterUseCase(
    stubUserRepo(overrides?.userRepo),
    stubSessionRepo(overrides?.sessionRepo),
    stubPasswordHasher(overrides?.passwordHasher),
    stubJwt(overrides?.jwt),
    stubCookieToken(overrides?.cookieToken),
    stubClock(overrides?.clock),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegisterUseCase', () => {
  const command = {
    email: 'cliente@example.com',
    password: 'securePassword123',
    displayName: 'Cliente Uno',
  };

  it('registra un cliente exitosamente y devuelve SessionDto + refreshToken', async () => {
    const uc = createUseCase();
    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.session.access_token).toBe('jwt-token');
      expect(result.value.session.expires_at).toBe(
        new Date(fixedDate.getTime() + 10 * 60 * 1000).toISOString(),
      );
      expect(result.value.session.user.role).toBe('cliente');
      expect(result.value.session.user.email).toBe('cliente@example.com');
      expect(result.value.session.user.must_change_password).toBe(false);
      expect(result.value.refreshToken).toBe('raw-refresh-token');
    }
  });

  it('falla con EMAIL_ALREADY_REGISTERED si el email ya existe', async () => {
    const uc = createUseCase(
{

      userRepo: {
        findByEmail: jest.fn().mockResolvedValue(
          ok({
            id: 'existing',
            email: 'cliente@example.com',
          } as User)),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.EMAIL_ALREADY_REGISTERED);
    }
  });

  it('normaliza el email a minúsculas', async () => {
    const findByEmail = jest.fn().mockResolvedValue(ok(null));
    const create = jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        phone: data.phone,
        role: data.role,
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    );
    const uc = createUseCase({ userRepo: { findByEmail, create } });

    await uc.execute({ ...command, email: 'Cliente@Example.COM' });

    expect(findByEmail).toHaveBeenCalledWith('cliente@example.com');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'cliente@example.com' }),
    );
  });

  it('usa la parte local del email como displayName si no se proporciona', async () => {
    const create = jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        phone: data.phone,
        role: data.role,
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    );
    const uc = createUseCase({ userRepo: { create } });

    await uc.execute({ email: 'nuevo@example.com', password: 'securePassword123' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'nuevo' }),
    );
  });

  it('hashea la contraseña antes de persistir', async () => {
    const hash = jest.fn().mockResolvedValue(ok('argon2-hash' as never));
    const create = jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'user-1',
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName,
        phone: data.phone,
        role: data.role,
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      } satisfies User)),
    );
    const uc = createUseCase(
{

      passwordHasher: { hash },
      userRepo: { create },
    });

    await uc.execute(command);

    expect(hash).toHaveBeenCalledWith('securePassword123');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'argon2-hash' }),
    );
  });

  it('crea una sesión AUTHENTICATED con refresh token hashado', async () => {
    const sessionCreate = jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'session-1',
        userId: data.userId,
        sessionKind: data.sessionKind,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      } satisfies Session)),
    );
    const uc = createUseCase({ sessionRepo: { create: sessionCreate } });

    await uc.execute(command);

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining(
{

        userId: 'user-1',
        sessionKind: 'AUTHENTICATED',
        refreshTokenHash: 'hashed-refresh-token',
      }),
    );
  });

  it('genera JWT con sub, session_id y role', async () => {
    const sign = jest.fn().mockResolvedValue(ok('jwt-token' as never));
    const uc = createUseCase({ jwt: { sign } });

    await uc.execute(command);

    expect(sign).toHaveBeenCalledWith(
{

      sub: 'user-1',
      session_id: 'session-1',
      role: 'cliente',
    });
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE ante error inesperado', async () => {
    const uc = createUseCase(
{

      userRepo: {
        findByEmail: jest.fn().mockResolvedValue(fail(technicalFailure())),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo del hasher de contraseña sin crear usuario ni sesión', async () => {
    const hash = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const create = jest.fn();
    const sessionCreate = jest.fn();
    const uc = createUseCase({
      passwordHasher: { hash },
      userRepo: { create },
      sessionRepo: { create: sessionCreate },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(create).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('propaga el fallo al crear el usuario sin crear sesión', async () => {
    const create = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const sessionCreate = jest.fn();
    const uc = createUseCase({
      userRepo: { create },
      sessionRepo: { create: sessionCreate },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('propaga el fallo al crear la sesión sin firmar JWT', async () => {
    const sessionCreate = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const sign = jest.fn();
    const uc = createUseCase({
      sessionRepo: { create: sessionCreate },
      jwt: { sign },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it('propaga el fallo al firmar el JWT de acceso', async () => {
    const sign = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const uc = createUseCase({ jwt: { sign } });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});
