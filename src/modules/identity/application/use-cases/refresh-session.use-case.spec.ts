import { RefreshSessionUseCase } from './refresh-session.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
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
const futureDate = new Date(fixedDate.getTime() + 5 * 60 * 1000); // 5 min in future

function stubSessionRepo(overrides?: Partial<SessionRepositoryPort>): SessionRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(ok(null)),
    findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(null)),
    rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined as never)),
    revoke: jest.fn().mockResolvedValue(ok(undefined as never)),
    revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined as never)),
    revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined as never)),
    findActiveByUserId: jest.fn().mockResolvedValue(ok(null)),
    findActiveByUserIdExcluding: jest.fn().mockResolvedValue(ok([])),
    touchActivity: jest.fn().mockResolvedValue(ok(undefined as never)),
    ...overrides,
  };
}

function stubUserRepo(overrides?: Partial<UserRepositoryPort>): UserRepositoryPort {
  return {
    findByEmail: jest.fn().mockResolvedValue(ok(null)),
    findById: jest.fn().mockResolvedValue(ok(null)),
    create: jest.fn(),
    updateProfile: jest.fn().mockResolvedValue(ok({} as User)),
    createAdmin: jest.fn(),
    updatePassword: jest.fn(),
    ...overrides,
  };
}

function stubJwt(overrides?: Partial<JwtPort>): JwtPort {
  return {
    sign: jest.fn().mockResolvedValue(ok('new-jwt-token' as never)),
    verify: jest.fn(),
    ...overrides,
  };
}

function stubCookieToken(overrides?: Partial<CookieTokenPort>): CookieTokenPort {
  return {
    generate: jest.fn().mockReturnValue('new-raw-refresh-token'),
    hash: jest.fn().mockImplementation((t: string) => `hashed:${t}`),
    ...overrides,
  };
}

function stubClock(overrides?: Partial<ClockPort>): ClockPort {
  return {
    now: jest.fn().mockReturnValue(fixedDate),
    ...overrides,
  };
}

const existingUser: User = {
  id: 'user-1',
  email: 'cliente@example.com',
  passwordHash: 'stored-hash',
  displayName: 'Cliente Uno',
  phone: null,
  role: 'cliente',
  mustChangePassword: false,
  createdAt: fixedDate,
  updatedAt: fixedDate,
};

const activeSession: Session = {
  id: 'session-1',
  userId: 'user-1',
  sessionKind: 'AUTHENTICATED',
  refreshTokenHash: 'hashed:old-refresh-token',
  expiresAt: futureDate,
  lastActivityAt: fixedDate,
  revokedAt: null,
  createdAt: fixedDate,
};

function createUseCase(overrides?: {
  sessionRepo?: Partial<SessionRepositoryPort>;
  userRepo?: Partial<UserRepositoryPort>;
  jwt?: Partial<JwtPort>;
  cookieToken?: Partial<CookieTokenPort>;
  clock?: Partial<ClockPort>;
}): RefreshSessionUseCase {
  return new RefreshSessionUseCase(
    stubSessionRepo(overrides?.sessionRepo),
    stubUserRepo(overrides?.userRepo),
    stubJwt(overrides?.jwt),
    stubCookieToken(overrides?.cookieToken),
    stubClock(overrides?.clock),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RefreshSessionUseCase', () => {
  describe('Success', () => {
    it('rota el refresh token y devuelve nueva sesión', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value.session.access_token).toBe('new-jwt-token');
        expect(result.value.refreshToken).toBe('new-raw-refresh-token');
        expect(result.value.session.user.role).toBe('cliente');
      }
    });

    it('actualiza el hash del refresh token en la sesión', async () => {
      const rotateRefreshToken = jest.fn().mockResolvedValue(ok(undefined as never));
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
          rotateRefreshToken,
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
      });

      await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(rotateRefreshToken).toHaveBeenCalledWith(
        'session-1',
        'hashed:new-raw-refresh-token',
        expect.any(Date),
      );
    });

    it('genera un nuevo JWT con los datos del usuario', async () => {
      const sign = jest.fn().mockResolvedValue('new-jwt-token');
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
        jwt: { sign },
      });

      await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(sign).toHaveBeenCalledWith(
{

        sub: 'user-1',
        session_id: 'session-1',
        role: 'cliente',
      });
    });
  });

  describe('Failure', () => {
    it('falla si la sesión no se encuentra por hash', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(null)),
        },
      });

      const result = await uc.execute({ refreshToken: 'unknown-token' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });

    it('falla si la sesión está revocada', async () => {
      const revokedSession: Session = { ...activeSession, revokedAt: fixedDate };
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(revokedSession),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });

    it('falla si la sesión ha expirado', async () => {
      const expiredSession: Session = {
        ...activeSession,
        expiresAt: new Date(fixedDate.getTime() - 1000), // 1s in past
      };
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(expiredSession),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });

    it('falla si el usuario asociado ya no existe', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(null)),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });

    it('falla para sesión guest (sin userId)', async () => {
      const guestSession: Session = { ...activeSession, userId: null, sessionKind: 'GUEST' };
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(guestSession),
        },
      });

      const result = await uc.execute({ refreshToken: 'guest-token' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });
  });

  describe('Rotación de token', () => {
    it('el token antiguo se reemplaza por uno nuevo (rotación)', async () => {
      const rotateRefreshToken = jest.fn().mockResolvedValue(ok(undefined as never));
      const generate = jest.fn().mockReturnValue('rotated-token');
      const hash = jest.fn().mockReturnValue('hashed:rotated-token');

      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
          rotateRefreshToken,
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
        cookieToken: { generate, hash },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        // El nuevo token es diferente del antiguo
        expect(result.value.refreshToken).toBe('rotated-token');
        expect(result.value.refreshToken).not.toBe('old-refresh-token');
      }
      // El hash almacenado es del nuevo token
      expect(rotateRefreshToken).toHaveBeenCalledWith(
        'session-1',
        'hashed:rotated-token',
        expect.any(Date),
      );
    });
  });

  describe('Error técnico', () => {
    it('propaga error de sessionRepo.findByRefreshTokenHash', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ refreshToken: 'token' });
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de userRepo.findById', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de sessionRepo.rotateRefreshToken', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
          rotateRefreshToken: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de jwt.sign', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(existingUser)),
        },
        jwt: {
          sign: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ refreshToken: 'old-refresh-token' });
      expect(isFailure(result)).toBe(true);
    });
  });
});
