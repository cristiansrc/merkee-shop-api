import { ok, fail } from '../../../../shared/domain/result';
import { ChangePasswordUseCase } from './change-password.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { IdempotencyPort, IdempotencyRecord } from '../../domain/ports/idempotency.port';
import { ChangePasswordUnitOfWorkPort } from '../../domain/ports/change-password-unit-of-work.port';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { createHash } from 'crypto';

function stubUserRepo(overrides: Partial<UserRepositoryPort> = {}): jest.Mocked<UserRepositoryPort> {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(ok({
      id: 'user-1',
      email: 'ada@example.com',
      passwordHash: 'hashed-old',
      displayName: 'Ada',
      phone: null,
      role: 'cliente',
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    create: jest.fn(),
    createAdmin: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn(),
    ...overrides,
  } as jest.Mocked<UserRepositoryPort>;
}

function stubSessionRepo(overrides: Partial<SessionRepositoryPort> = {}): jest.Mocked<SessionRepositoryPort> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByRefreshTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    findActiveByUserIdExcluding: jest.fn().mockResolvedValue(ok([])),
    rotateRefreshToken: jest.fn(),
    touchActivity: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
    revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  } as jest.Mocked<SessionRepositoryPort>;
}

function stubPasswordHasher(
  verifyImpl: (plain: string, hash: string) => Promise<boolean> = async () => true,
): jest.Mocked<PasswordHasherPort> {
  return {
    hash: jest.fn(async (pw: string) => ok(`hashed:${pw}` as never)),
    verify: jest.fn(async (plain: string, hash: string) => ok(await verifyImpl(plain, hash) as never)),
  } as jest.Mocked<PasswordHasherPort>;
}

function stubJwt(): jest.Mocked<JwtPort> {
  return {
    sign: jest.fn(async () => 'fake-jwt'),
    verify: jest.fn(),
  } as unknown as jest.Mocked<JwtPort>;
}

function stubCookieToken(overrides: Partial<CookieTokenPort> = {}): jest.Mocked<CookieTokenPort> {
  return {
    generate: jest.fn(() => 'new-rotated-token'),
    hash: jest.fn((t: string) => `hash:${t}`),
    ...overrides,
  } as jest.Mocked<CookieTokenPort>;
}

function stubClock(): jest.Mocked<ClockPort> {
  return { now: jest.fn(() => new Date('2026-01-01T00:00:00Z')) };
}

function stubIdempotency(overrides: Partial<IdempotencyPort> = {}): jest.Mocked<IdempotencyPort> {
  return {
    find: jest.fn().mockResolvedValue(null),
    findForUpdate: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IdempotencyPort>;
}

function computeBodyHash(currentPassword: string, newPassword: string): string {
  const canonical = JSON.stringify({ current_password: currentPassword, new_password: newPassword });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Crea un UoW mock con estado compartido para simular concurrencia.
 * El mapa `idempotencyState` persiste entre llamadas a `run()`.
 */
function createSharedUnitOfWork(
  state?: Map<string, IdempotencyRecord>,
  sessionOverrides?: {
    rotateRefreshToken?: jest.Mock;
    revokeAllForUserExcept?: jest.Mock;
    updatePassword?: jest.Mock;
  },
): { unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort>; state: Map<string, IdempotencyRecord> } {
  const idempotencyState = state ?? new Map<string, IdempotencyRecord>();
  const unitOfWork = {
    run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
      const fakeIdempotency = {
        findForUpdate: jest.fn().mockImplementation(
          async (scope: string, key: string) =>
            idempotencyState.get(`${scope}:${key}`) ?? null,
        ),
        save: jest.fn().mockImplementation(
          async (scope: string, key: string, bodyHash: string, responseJson: unknown) => {
            idempotencyState.set(`${scope}:${key}`, {
              scope,
              key,
              bodyHash,
              responseJson,
            });
          },
        ),
      };
      const fakeTx = {
        userRepo: {
          updatePassword:
            sessionOverrides?.updatePassword ??
            jest.fn().mockResolvedValue(ok(undefined as never)),
        },
        sessionRepo: {
          rotateRefreshToken:
            sessionOverrides?.rotateRefreshToken ??
            jest.fn().mockResolvedValue(ok(undefined as never)),
          revokeAllForUserExcept:
            sessionOverrides?.revokeAllForUserExcept ??
            jest.fn().mockResolvedValue(ok(undefined as never)),
        },
        idempotency: fakeIdempotency,
      };
      const value = await work(fakeTx);
      return ok(value as unknown as never);
    }),
  } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
  return { unitOfWork, state: idempotencyState };
}

describe('ChangePasswordUseCase (MSF-ID-003, ADR-020)', () => {
  const actorId = 'user-1';
  const sessionId = 'session-current';

  it('rechaza con AUTHENTICATION_REQUIRED si no hay actor', async () => {
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId: '',
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('rechaza con 422 CURRENT_PASSWORD_INVALID cuando la contraseña actual no coincide', async () => {
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => false),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'WrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.CURRENT_PASSWORD_INVALID);
    }
  });

  it('cambia la contraseña, rota la cookie y devuelve resultado kind=changed', async () => {
    const hasher = stubPasswordHasher(async () => true);
    const { unitOfWork } = createSharedUnitOfWork();
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: hasher,
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('changed');
      if (result.value.kind === 'changed') {
        expect(result.value.newRefreshToken).toBe('new-rotated-token');
        expect(result.value.cookieExpiresAt).toBeInstanceOf(Date);
      }
    }
    // El hash de la nueva contraseña salió del hasher.
    expect(hasher.hash).toHaveBeenCalledWith('NewStrongP@ssw0rd!123');
    expect(unitOfWork.run).toHaveBeenCalledWith(
      sessionId,
      expect.any(Function),
    );
  });

  it('rechaza con 409 IDEMPOTENCY_KEY_REUSED cuando la clave coincide con body divergente', async () => {
    const state = new Map<string, IdempotencyRecord>();
    const divergentKey = '55555555-5555-4555-8555-555555555555';
    state.set(`password-change:user-1:${divergentKey}`, {
      scope: 'password-change:user-1',
      key: divergentKey,
      bodyHash: 'hash-distinto',
      responseJson: {},
    });
    // La lectura inicial (find sin lock) también debe encontrar el registro
    const idempotency = stubIdempotency({
      find: jest.fn().mockImplementation(
        async (scope: string, key: string) =>
          state.get(`${scope}:${key}`) ?? null,
      ),
    });
    const { unitOfWork } = createSharedUnitOfWork(state);
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency,
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: divergentKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('replay: misma clave + mismo body devuelve kind=replay sin hashear ni rotar (ADR-020)', async () => {
    const currentPassword = 'OldStrongP@ssw0rd!';
    const newPassword = 'NewStrongP@ssw0rd!123';
    const replayKey = '66666666-6666-4666-8666-666666666666';
    const bodyHash = computeBodyHash(currentPassword, newPassword);
    const state = new Map<string, IdempotencyRecord>();
    state.set(`password-change:user-1:${replayKey}`, {
      scope: 'password-change:user-1',
      key: replayKey,
      bodyHash,
      responseJson: { status: 204, body_hash: bodyHash },
    });
    const hasher = stubPasswordHasher(async () => true);
    // La lectura inicial (find sin lock) debe encontrar el registro
    const idempotency = stubIdempotency({
      find: jest.fn().mockImplementation(
        async (scope: string, key: string) =>
          state.get(`${scope}:${key}`) ?? null,
      ),
    });
    const { unitOfWork } = createSharedUnitOfWork(state);
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: hasher,
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency,
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword,
      newPassword,
      idempotencyKey: replayKey,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('replay');
    }
    // En replay NO se vuelve a hashear la contraseña (ADR-020)
    expect(hasher.hash).not.toHaveBeenCalled();
    // En replay NO se valida la contraseña actual (ADR-020)
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('current_password no se valida en replay (ADR-020: detección precede a validación)', async () => {
    const currentPassword = 'OldStrongP@ssw0rd!';
    const newPassword = 'NewStrongP@ssw0rd!123';
    const replayKey = 'aaaa-bbbb-cccc-dddd-111122223333';
    const bodyHash = computeBodyHash(currentPassword, newPassword);
    const state = new Map<string, IdempotencyRecord>();
    state.set(`password-change:user-1:${replayKey}`, {
      scope: 'password-change:user-1',
      key: replayKey,
      bodyHash,
      responseJson: { status: 204, body_hash: bodyHash },
    });
    // El hasher verify siempre falla — si se invocara, el use case devolvería 422.
    const hasher = stubPasswordHasher(async () => false);
    const idempotency = stubIdempotency({
      find: jest.fn().mockImplementation(
        async (scope: string, key: string) =>
          state.get(`${scope}:${key}`) ?? null,
      ),
    });
    const { unitOfWork } = createSharedUnitOfWork(state);
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: hasher,
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency,
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword,
      newPassword,
      idempotencyKey: replayKey,
    });
    // A pesar de que verify fallaría, el use case devuelve replay porque
    // la detección de replay precede a la validación de current_password.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('replay');
    }
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('snapshot mínimo contiene solo status 204 y body_hash (ADR-020: sin credenciales)', async () => {
    const { unitOfWork, state } = createSharedUnitOfWork();
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const currentPassword = 'OldStrongP@ssw0rd!';
    const newPassword = 'NewStrongP@ssw0rd!123';
    const key = 'snapshot-test-1111-2222-3333-444455556666';
    await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword,
      newPassword,
      idempotencyKey: key,
    });
    const snapshot = state.get(`password-change:user-1:${key}`);
    expect(snapshot).toBeDefined();
    if (snapshot) {
      const json = snapshot.responseJson as Record<string, unknown>;
      // Solo status y body_hash
      expect(Object.keys(json)).toEqual(['status', 'body_hash']);
      expect(json.status).toBe(204);
      expect(json.body_hash).toBe(computeBodyHash(currentPassword, newPassword));
      // NUNCA persiste refresh token, hash de sesión, contraseña o credenciales
      expect(json).not.toHaveProperty('newRefreshToken');
      expect(json).not.toHaveProperty('cookieExpiresAt');
      expect(json).not.toHaveProperty('refreshToken');
      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('password');
      expect(json).not.toHaveProperty('secret');
    }
  });

  it('traduce fallo técnico de la unidad transaccional a TECHNICAL_DEPENDENCY_FAILURE', async () => {
    const unitOfWork: ChangePasswordUnitOfWorkPort = {
      run: jest.fn().mockResolvedValue(
        fail({
          code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          kind: 'technical',
          messageKey: 'technical.dependency_failure',
        }),
      ),
    };
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('rollback total: si falla revokeAllForUserExcept, no persiste idempotencia ni devuelve cookie', async () => {
    const failingUnitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
      run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updatePassword: jest.fn().mockResolvedValue(ok(undefined as never)),
          },
          sessionRepo: {
            rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
            revokeAllForUserExcept: jest.fn().mockRejectedValue(new Error('db error')),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue(undefined),
          },
        };
        try {
          await work(fakeTx);
          return ok(undefined as never);
        } catch {
          return fail({
            code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
            kind: 'technical',
            messageKey: 'technical.dependency_failure',
          });
        }
      }),
    } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: failingUnitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('rechaza con AUTHENTICATION_REQUIRED si el usuario no existe', async () => {
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo({ findById: jest.fn().mockResolvedValue(ok(null)) }),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('propaga el fallo técnico al buscar el usuario', async () => {
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo({
        findById: jest.fn().mockResolvedValue(fail({
          code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          kind: 'technical',
          messageKey: 'technical.dependency_failure',
        })),
      }),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo técnico del hasher al verificar la contraseña actual', async () => {
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: {
        hash: jest.fn(async (pw: string) => ok(`hashed:${pw}` as never)),
        verify: jest.fn().mockResolvedValue(fail({
          code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          kind: 'technical',
          messageKey: 'technical.dependency_failure',
        })),
      } as jest.Mocked<PasswordHasherPort>,
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo del hasher de la nueva contraseña dentro de la transacción', async () => {
    const unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
      run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updatePassword: jest.fn().mockResolvedValue(ok(undefined as never)),
          },
          sessionRepo: {
            rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
            revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue(undefined),
          },
        };
        const value = await work(fakeTx);
        return ok(value as unknown as never);
      }),
    } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: {
        hash: jest.fn().mockResolvedValue(fail({
          code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          kind: 'technical',
          messageKey: 'technical.dependency_failure',
        })),
        verify: jest.fn(async (_plain: string, _hash: string) => ok(true as never)),
      } as jest.Mocked<PasswordHasherPort>,
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo de updatePassword dentro de la transacción', async () => {
    const unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
      run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updatePassword: jest.fn().mockResolvedValue(fail({
              code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
              kind: 'technical',
              messageKey: 'technical.dependency_failure',
            })),
          },
          sessionRepo: {
            rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
            revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue(undefined),
          },
        };
        const value = await work(fakeTx);
        return ok(value as unknown as never);
      }),
    } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo de rotateRefreshToken dentro de la transacción', async () => {
    const unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
      run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updatePassword: jest.fn().mockResolvedValue(ok(undefined as never)),
          },
          sessionRepo: {
            rotateRefreshToken: jest.fn().mockResolvedValue(fail({
              code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
              kind: 'technical',
              messageKey: 'technical.dependency_failure',
            })),
            revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue(undefined),
          },
        };
        const value = await work(fakeTx);
        return ok(value as unknown as never);
      }),
    } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo de revokeAllForUserExcept devuelto como Result dentro de la transacción', async () => {
    const unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
      run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updatePassword: jest.fn().mockResolvedValue(ok(undefined as never)),
          },
          sessionRepo: {
            rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
            revokeAllForUserExcept: jest.fn().mockResolvedValue(fail({
              code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
              kind: 'technical',
              messageKey: 'technical.dependency_failure',
            })),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue(undefined),
          },
        };
        const value = await work(fakeTx);
        return ok(value as unknown as never);
      }),
    } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;
    const uc = new ChangePasswordUseCase({
      userRepo: stubUserRepo(),
      sessionRepo: stubSessionRepo(),
      passwordHasher: stubPasswordHasher(async () => true),
      jwt: stubJwt(),
      cookieToken: stubCookieToken(),
      clock: stubClock(),
      idempotency: stubIdempotency(),
      unitOfWork,
      refreshCookieTtlMs: 600_000,
    });
    const result = await uc.execute({
      actorId,
      currentSessionId: sessionId,
      currentPassword: 'OldStrongP@ssw0rd!',
      newPassword: 'NewStrongP@ssw0rd!123',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  // ── Tests de concurrencia determinista (ADR-020) ─────────────────────

  describe('concurrencia determinista (ADR-020)', () => {
    it('dos requests con misma clave + mismo body: segundo devuelve replay sin rotar token', async () => {
      const currentPassword = 'OldStrongP@ssw0rd!';
      const newPassword = 'NewStrongP@ssw0rd!123';
      const key = 'aaaa1111-1111-4111-8111-111111111111';
      const rotateSpy = jest.fn().mockResolvedValue(ok(undefined as never));
      const revokeSpy = jest.fn().mockResolvedValue(ok(undefined as never));
      const { unitOfWork, state } = createSharedUnitOfWork(
        undefined,
        { rotateRefreshToken: rotateSpy, revokeAllForUserExcept: revokeSpy },
      );

      // Primer request: ejecuta la mutación completa
      const uc1 = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const result1 = await uc1.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword,
        newPassword,
        idempotencyKey: key,
      });
      expect(result1.ok).toBe(true);
      if (result1.ok) {
        expect(result1.value.kind).toBe('changed');
      }
      expect(rotateSpy).toHaveBeenCalledTimes(1);
      expect(revokeSpy).toHaveBeenCalledTimes(1);

      // Segundo request con misma clave + mismo body: replay
      rotateSpy.mockClear();
      revokeSpy.mockClear();
      const uc2 = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const result2 = await uc2.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword,
        newPassword,
        idempotencyKey: key,
      });
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.kind).toBe('replay');
      }
      // En replay no se rota ni revoca
      expect(rotateSpy).not.toHaveBeenCalled();
      expect(revokeSpy).not.toHaveBeenCalled();
      // Solo una entrada en el mapa de idempotencia
      expect(state.size).toBe(1);
    });

    it('dos requests con misma clave + body divergente: segundo devuelve 409', async () => {
      const { unitOfWork } = createSharedUnitOfWork();
      const key = 'bbbb2222-2222-4222-8222-222222222222';

      // Primer request exitoso
      const uc1 = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      await uc1.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'OldStrongP@ssw0rd!',
        newPassword: 'NewStrongP@ssw0rd!123',
        idempotencyKey: key,
      });

      // Segundo request con body diferente
      const uc2 = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const result2 = await uc2.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'DifferentPassword!!',
        newPassword: 'AnotherNewPass12345',
        idempotencyKey: key,
      });
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
      }
    });

    it('rollback: si la primera transacción falla, la segunda puede proceder sin duplicar', async () => {
      const idempotencyState = new Map<string, IdempotencyRecord>();
      let callCount = 0;
      const key = 'cccc3333-3333-4333-8333-333333333333';

      // Primera llamada: falla en revokeAllForUserExcept; segunda: tiene éxito
      const unitOfWork: jest.Mocked<ChangePasswordUnitOfWorkPort> = {
        run: jest.fn(async (_keep: string, work: (tx: any) => Promise<any>) => {
          callCount++;
          const failingOnFirst = callCount === 1;
          const fakeIdempotency = {
            findForUpdate: jest.fn().mockImplementation(
              async (scope: string, k: string) =>
                idempotencyState.get(`${scope}:${k}`) ?? null,
            ),
            save: jest.fn().mockImplementation(
              async (scope: string, k: string, bodyHash: string, responseJson: unknown) => {
                idempotencyState.set(`${scope}:${k}`, {
                  scope, key: k, bodyHash, responseJson,
                });
              },
            ),
          };
          const fakeTx = {
            userRepo: {
              updatePassword: jest.fn().mockResolvedValue(ok(undefined as never)),
            },
            sessionRepo: {
              rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
              revokeAllForUserExcept: failingOnFirst
                ? jest.fn().mockRejectedValue(new Error('db error'))
                : jest.fn().mockResolvedValue(ok(undefined as never)),
            },
            idempotency: fakeIdempotency,
          };
          try {
            const value = await work(fakeTx);
            return ok(value as unknown as never);
          } catch {
            return fail({
              code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
              kind: 'technical',
              messageKey: 'technical.dependency_failure',
            });
          }
        }),
      } as unknown as jest.Mocked<ChangePasswordUnitOfWorkPort>;

      const failingUc = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const result1 = await failingUc.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'OldStrongP@ssw0rd!',
        newPassword: 'NewStrongP@ssw0rd!123',
        idempotencyKey: key,
      });
      expect(result1.ok).toBe(false);
      // No se persistió idempotencia
      expect(idempotencyState.size).toBe(0);

      // Segunda llamada: tiene éxito
      const successUc = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken(),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const result2 = await successUc.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'OldStrongP@ssw0rd!',
        newPassword: 'NewStrongP@ssw0rd!123',
        idempotencyKey: key,
      });
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.kind).toBe('changed');
      }
    });
  });

  // ── Tests de seguridad y minimización (ADR-020) ─────────────────────

  describe('minimización de credenciales (ADR-020)', () => {
    it('ningún secreto aparece en el snapshot de idempotencia', async () => {
      const { unitOfWork, state } = createSharedUnitOfWork();
      const uc = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken({ generate: () => 'super-secret-token-123' }),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const key = 'secret-test-1111-2222-3333-444455556666';
      await uc.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'OldStrongP@ssw0rd!',
        newPassword: 'NewStrongP@ssw0rd!123',
        idempotencyKey: key,
      });
      const snapshot = state.get(`password-change:user-1:${key}`);
      expect(snapshot).toBeDefined();
      if (snapshot) {
        const serialized = JSON.stringify(snapshot.responseJson);
        // Nunca contiene tokens, hashes, contraseñas ni secretos
        expect(serialized).not.toContain('super-secret-token-123');
        expect(serialized).not.toContain('hashed-old');
        expect(serialized).not.toContain('OldStrongP@ssw0rd!');
        expect(serialized).not.toContain('NewStrongP@ssw0rd!123');
        expect(serialized).not.toContain('refreshToken');
        expect(serialized).not.toContain('cookieExpires');
      }
    });

    it('resultado changed contiene el token pero NUNCA se persiste en idempotencia', async () => {
      const { unitOfWork, state } = createSharedUnitOfWork();
      const secretToken = 'ultra-secret-rotated-token';
      const uc = new ChangePasswordUseCase({
        userRepo: stubUserRepo(),
        sessionRepo: stubSessionRepo(),
        passwordHasher: stubPasswordHasher(async () => true),
        jwt: stubJwt(),
        cookieToken: stubCookieToken({ generate: () => secretToken }),
        clock: stubClock(),
        idempotency: stubIdempotency(),
        unitOfWork,
        refreshCookieTtlMs: 600_000,
      });
      const key = 'token-test-1111-2222-3333-444455556666';
      const result = await uc.execute({
        actorId,
        currentSessionId: sessionId,
        currentPassword: 'OldStrongP@ssw0rd!',
        newPassword: 'NewStrongP@ssw0rd!123',
        idempotencyKey: key,
      });
      // El resultado sí contiene el token (para Set-Cookie)
      expect(result.ok).toBe(true);
      if (result.ok && result.value.kind === 'changed') {
        expect(result.value.newRefreshToken).toBe(secretToken);
      }
      // Pero el snapshot en idempotencia NO lo contiene
      const snapshot = state.get(`password-change:user-1:${key}`);
      expect(snapshot).toBeDefined();
      if (snapshot) {
        const serialized = JSON.stringify(snapshot.responseJson);
        expect(serialized).not.toContain(secretToken);
      }
    });
  });
});
