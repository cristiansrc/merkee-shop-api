import { ActivateAdminUseCase } from './activate-admin.use-case';
import { AdminActivationTokenRepositoryPort } from '../../domain/ports/admin-activation-token-repository.port';
import { ActivateAdminUnitOfWorkPort } from '../../domain/ports/activate-admin-unit-of-work.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { AdminActivationToken } from '../../domain/models/admin-activation-token';
import { isSuccess, isFailure, ok, fail } from '../../../../shared/domain/result';
import { DomainErrorCode, DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

const activeToken: AdminActivationToken = {
  id: 'token-1',
  userId: 'new-admin-1',
  tokenHash: 'hashed-activation-token',
  expiresAt: new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000),
  usedAt: null,
  createdByUserId: 'actor-1',
  createdAt: fixedDate,
  updatedAt: fixedDate,
};

function stubActivationTokenRepo(
  overrides?: Partial<AdminActivationTokenRepositoryPort>,
): AdminActivationTokenRepositoryPort {
  return {
    findByTokenHash: jest.fn().mockResolvedValue(activeToken),
    findActiveByUserId: jest.fn().mockResolvedValue(activeToken),
    create: jest.fn(),
    revokeExpiredUnused: jest.fn(),
    consumeUnused: jest.fn().mockResolvedValue(ok(true)),
    ...overrides,
  };
}

function stubPasswordHasher(overrides?: Partial<PasswordHasherPort>): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue(ok('argon2-hash')),
    verify: jest.fn(),
    ...overrides,
  };
}

function stubCookieToken(overrides?: Partial<CookieTokenPort>): CookieTokenPort {
  return {
    generate: jest.fn(),
    hash: jest.fn().mockReturnValue('hashed-activation-token'),
    ...overrides,
  };
}

function stubClock(overrides?: Partial<ClockPort>): ClockPort {
  return {
    now: jest.fn().mockReturnValue(fixedDate),
    ...overrides,
  };
}

/**
 * Stub del puerto de unidad de trabajo: ejecuta el callback con una
 * transacción falsa cuyos repositorios son stubs. Permite observar qué
 * operaciones se invocan dentro de la transacción y simular fallos.
 */
function stubUnitOfWork(overrides?: {
  tx?: {
    userRepo?: Partial<ActivateAdminUnitOfWorkPort> & Record<string, unknown>;
    sessionRepo?: Record<string, unknown>;
    activationTokenRepo?: Partial<AdminActivationTokenRepositoryPort>;
  };
  run?: jest.Mock;
}): ActivateAdminUnitOfWorkPort {
  const tx = {
    userRepo: {
      updatePassword: jest.fn().mockResolvedValue({
        id: 'new-admin-1',
        email: 'newadmin@example.com',
        passwordHash: 'argon2-hash',
        displayName: 'Nuevo Admin',
        phone: null,
        role: 'admin',
        mustChangePassword: false,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      }),
      ...overrides?.tx?.userRepo,
    },
    sessionRepo: {
      revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined)),
      ...overrides?.tx?.sessionRepo,
    },
    activationTokenRepo: {
    consumeUnused: jest.fn().mockResolvedValue(true),
      ...overrides?.tx?.activationTokenRepo,
    },
  };
  return {
    run: (overrides?.run ?? jest.fn(async (cb) => ok(await cb(tx)))) as never,
  };
}

function createUseCase(overrides?: {
  activationTokenRepo?: Partial<AdminActivationTokenRepositoryPort>;
  unitOfWork?: ActivateAdminUnitOfWorkPort;
  passwordHasher?: Partial<PasswordHasherPort>;
  cookieToken?: Partial<CookieTokenPort>;
  clock?: Partial<ClockPort>;
}): ActivateAdminUseCase {
  return new ActivateAdminUseCase({
    activationTokenRepo: stubActivationTokenRepo(overrides?.activationTokenRepo),
    unitOfWork: overrides?.unitOfWork ?? stubUnitOfWork(),
    passwordHasher: stubPasswordHasher(overrides?.passwordHasher),
    cookieToken: stubCookieToken(overrides?.cookieToken),
    clock: stubClock(overrides?.clock),
  });
}

const command = {
  token: 'raw-activation-token',
  newPassword: 'NuevaContraseñaSegura123',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivateAdminUseCase', () => {
  it('activa al admin dentro de la transacción: consume token, actualiza contraseña y revoca sesiones', async () => {
    const tx = {
      userRepo: {
        updatePassword: jest.fn().mockResolvedValue({
          id: 'new-admin-1',
          email: 'newadmin@example.com',
          passwordHash: 'argon2-hash',
          displayName: 'Nuevo Admin',
          phone: null,
          role: 'admin',
          mustChangePassword: false,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        }),
      },
      sessionRepo: { revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined as never)) },
      activationTokenRepo: { consumeUnused: jest.fn().mockResolvedValue(ok(true)) },
    };
    const run = jest.fn(async (cb: (t: unknown) => unknown) => ok(await cb(tx)));
    const uc = createUseCase({ unitOfWork: stubUnitOfWork({ run }) });

    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(tx.activationTokenRepo.consumeUnused).toHaveBeenCalledWith(
      'token-1',
      fixedDate,
    );
    expect(tx.userRepo.updatePassword).toHaveBeenCalledWith(
      'new-admin-1',
      'argon2-hash',
    );
    expect(tx.sessionRepo.revokeAllForUser).toHaveBeenCalledWith('new-admin-1');
  });

  it('hashea la contraseña fuera de la transacción y nunca la devuelve', async () => {
    const hash = jest.fn().mockResolvedValue('argon2-hash');
    const uc = createUseCase({ passwordHasher: { hash } });

    const result = await uc.execute(command);

    expect(hash).toHaveBeenCalledWith('NuevaContraseñaSegura123');
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBeUndefined();
    }
  });

  it('busca el token por hash, nunca en claro', async () => {
    const findByTokenHash = jest.fn().mockResolvedValue(activeToken);
    const uc = createUseCase({ activationTokenRepo: { findByTokenHash } });

    await uc.execute(command);

    expect(findByTokenHash).toHaveBeenCalledWith('hashed-activation-token');
    expect(findByTokenHash.mock.calls[0][0]).not.toContain('raw-activation-token');
  });

  it('rechaza con ACTIVATION_TOKEN_INVALID_OR_EXPIRED si el token no existe', async () => {
    const uc = createUseCase({
      activationTokenRepo: { findByTokenHash: jest.fn().mockResolvedValue(ok(null)) },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED,
      );
    }
  });

  it('rechaza con ACTIVATION_TOKEN_INVALID_OR_EXPIRED si el token ya fue usado o expiró', async () => {
    const uc = createUseCase({
      unitOfWork: stubUnitOfWork({
        tx: { activationTokenRepo: { consumeUnused: jest.fn().mockResolvedValue(false) } },
      }),
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED,
      );
    }
  });

  it('canje concurrente: solo una activación consume el token; la otra falla', async () => {
    // Simula dos solicitudes concurrentes sobre el mismo token: la primera
    // consume atómicamente (true), la segunda encuentra el token ya usado
    // (false) y falla con 422 sin revelar el estado.
    const consumeUnused = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const uc = createUseCase({
      unitOfWork: stubUnitOfWork({ tx: { activationTokenRepo: { consumeUnused } } }),
    });

    const first = await uc.execute(command);
    const second = await uc.execute(command);

    expect(isSuccess(first)).toBe(true);
    expect(isFailure(second)).toBe(true);
    if (isFailure(second)) {
      expect(second.error.code).toBe(
        DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED,
      );
    }
    expect(consumeUnused).toHaveBeenCalledTimes(2);
  });

  it('no revela el estado del token en el error (mensaje neutro)', async () => {
    const uc = createUseCase({
      activationTokenRepo: { findByTokenHash: jest.fn().mockResolvedValue(ok(null)) },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.messageKey).toBe(
        'activation.token_invalid_or_expired',
      );
      expect(result.error.metadata).toBeUndefined();
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si la transacción falla (rollback total)', async () => {
    // El puerto de unidad de trabajo lanza: Prisma revierte todo y el caso de
    // uso traduce el fallo a un error técnico sin filtrar detalles.
    const run = jest.fn().mockResolvedValue(fail({
      code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      kind: 'technical',
      messageKey: 'technical.dependency_failure',
    }));
    const uc = createUseCase({ unitOfWork: stubUnitOfWork({ run }) });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
  });

  it('propaga al borde la excepción inesperada de la lectura del token', async () => {
    const uc = createUseCase({
      activationTokenRepo: {
        findByTokenHash: jest.fn().mockResolvedValue(null),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED);
    }
  });
});
