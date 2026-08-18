import { ok, fail } from '../../../../shared/domain/result';
import { GetMyProfileUseCase } from './get-my-profile.use-case';
import { UserRepositoryPort, ProfileUpdateData } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { authenticationRequired, sessionNotFoundOrExpired } from '../../domain/identity-errors';

function stubUserRepo(overrides: Partial<UserRepositoryPort> = {}): jest.Mocked<UserRepositoryPort> {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    createAdmin: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn().mockResolvedValue(ok({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'x',
      displayName: 'Ada Lovelace',
      phone: '+57 300 000 0000',
      role: 'cliente',
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ...overrides,
  } as jest.Mocked<UserRepositoryPort>;
}

function stubSessionRepo(): jest.Mocked<SessionRepositoryPort> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByRefreshTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    findActiveByUserIdExcluding: jest.fn(),
    rotateRefreshToken: jest.fn(),
    touchActivity: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    revokeAllForUserExcept: jest.fn(),
  } as jest.Mocked<SessionRepositoryPort>;
}

function stubClock(): jest.Mocked<ClockPort> {
  return { now: jest.fn(() => new Date('2026-01-01T00:00:00Z')) };
}

describe('GetMyProfileUseCase (MSF-ID-003)', () => {
  it('devuelve el UserDto del usuario autenticado', async () => {
    const userRepo = stubUserRepo({
      findById: jest.fn().mockResolvedValue(ok({
        id: 'user-1',
        email: 'ada@example.com',
        passwordHash: 'x',
        displayName: 'Ada Lovelace',
        phone: '+57 300 000 0000',
        role: 'cliente',
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
    const uc = new GetMyProfileUseCase({
      userRepo,
      sessionRepo: stubSessionRepo(),
      clock: stubClock(),
    });
    const result = await uc.execute({
      accessToken: null,
      userIdFromGuard: 'user-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.user).toMatchObject({
        id: 'user-1',
        email: 'ada@example.com',
        role: 'cliente',
        must_change_password: false,
      });
    }
  });

  it('rechaza con AUTHENTICATION_REQUIRED si no hay actor extraído por el guard', async () => {
    const uc = new GetMyProfileUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      clock: stubClock(),
    });
    const result = await uc.execute({ accessToken: null, userIdFromGuard: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('rechaza si el usuario ya no existe (devuelve AUTHENTICATION_REQUIRED sin filtrar)', async () => {
    const userRepo = stubUserRepo({ findById: jest.fn().mockResolvedValue(ok(null)) });
    const uc = new GetMyProfileUseCase({
      userRepo,
      sessionRepo: stubSessionRepo(),
      clock: stubClock(),
    });
    const result = await uc.execute({
      accessToken: null,
      userIdFromGuard: 'user-deleted',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('propaga el fallo técnico del repositorio sin filtrar la causa', async () => {
    const userRepo = stubUserRepo({
      findById: jest.fn().mockResolvedValue(fail({
        code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      })),
    });
    const uc = new GetMyProfileUseCase({
      userRepo,
      sessionRepo: stubSessionRepo(),
      clock: stubClock(),
    });
    const result = await uc.execute({
      accessToken: null,
      userIdFromGuard: 'user-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      expect(result.error.metadata).toBeUndefined();
    }
  });
});
