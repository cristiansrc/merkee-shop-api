import { readFileSync } from 'fs';
import { join } from 'path';
import { BootstrapInitialAdminUseCase } from './bootstrap-initial-admin.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { InitialAdminSecretPort } from '../../domain/ports/initial-admin-secret.port';
import { BootstrapUnitOfWorkPort } from '../../domain/ports/bootstrap-unit-of-work.port';
import { User } from '../../domain/models/user';
import { ok, fail, isSuccess, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

function adminUser(overrides?: Partial<User>): User {
  return {
    id: 'admin-1',
    email: 'cristiansrc@gmail.com',
    passwordHash: 'hashed-password',
    displayName: 'Admin',
    phone: null,
    role: 'admin',
    mustChangePassword: true,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

function stubUserRepo(overrides?: Partial<UserRepositoryPort>): UserRepositoryPort {
  return {
    findByEmail: jest.fn().mockResolvedValue(ok(null)),
    findById: jest.fn().mockResolvedValue(ok(null)),
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(adminUser({ email: data.email, passwordHash: data.passwordHash }))),
    ),
    createAdmin: jest.fn().mockResolvedValue(ok(adminUser())),
    updatePassword: jest.fn().mockResolvedValue(ok(adminUser({ mustChangePassword: false }))),
    updateProfile: jest.fn(),
    ...overrides,
  };
}

function stubPasswordHasher(overrides?: Partial<PasswordHasherPort>): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue(ok('argon2-hash')),
    verify: jest.fn().mockResolvedValue(ok(true)),
    ...overrides,
  };
}

function stubSecret(overrides?: Partial<InitialAdminSecretPort>): InitialAdminSecretPort {
  return {
    getInitialAdminPassword: jest.fn().mockReturnValue('external-secret'),
    ...overrides,
  };
}

/**
 * Stub de la unidad de trabajo: ejecuta el callback con los repositorios
 * transaccionales y devuelve `Result`. Imita el contrato del adapter real:
 * captura las excepciones técnicas del callback en su límite y las traduce a
 * `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP). La aplicación nunca
 * captura excepciones técnicas: solo recibe el rail `Failure`.
 */
function stubUnitOfWork(
  innerUserRepo: UserRepositoryPort,
  overrides?: Partial<BootstrapUnitOfWorkPort>,
): BootstrapUnitOfWorkPort {
  return {
    run: jest.fn(async (work) => {
      try {
        const value = await work({ userRepo: innerUserRepo });
        return ok(value);
      } catch {
        return fail(technicalFailure());
      }
    }),
    ...overrides,
  } as BootstrapUnitOfWorkPort;
}

function createUseCase(overrides?: {
  userRepo?: Partial<UserRepositoryPort>;
  passwordHasher?: Partial<PasswordHasherPort>;
  secret?: Partial<InitialAdminSecretPort>;
  unitOfWork?: Partial<BootstrapUnitOfWorkPort>;
}): BootstrapInitialAdminUseCase {
  // El mismo repo se usa dentro de la transacción, de modo que los mocks de
  // `create`/`findByEmail` se observan en el callback transaccional.
  const userRepo = stubUserRepo(overrides?.userRepo);
  return new BootstrapInitialAdminUseCase(
    stubPasswordHasher(overrides?.passwordHasher),
    stubSecret(overrides?.secret),
    stubUnitOfWork(userRepo, overrides?.unitOfWork),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BootstrapInitialAdminUseCase', () => {
  it('la capa application NO captura excepciones técnicas (sin try/catch)', () => {
    const source = readFileSync(
      join(__dirname, 'bootstrap-initial-admin.use-case.ts'),
      'utf8',
    );
    // Master Spec §ROP: la traducción de fallos técnicos vive en el adapter de
    // infraestructura; la aplicación solo devuelve `Result` para reglas.
    expect(source).not.toMatch(/\btry\s*\{/);
    expect(source).not.toMatch(/\bcatch\s*\{/);
  });

  it('falla de forma segura (TECHNICAL_DEPENDENCY_FAILURE) si el secreto falta y NO crea usuario', async () => {
    const create = jest.fn();
    const uc = createUseCase({
      secret: { getInitialAdminPassword: jest.fn().mockReturnValue(null) },
      userRepo: { create },
    });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('crea el admin inicial con email canónico, rol admin y must_change_password=true', async () => {
    const create = jest.fn().mockImplementation((data) =>
      Promise.resolve(adminUser({ email: data.email, passwordHash: data.passwordHash })),
    );
    const uc = createUseCase({ userRepo: { create } });

    const result = await uc.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.outcome).toBe('created');
    }
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'cristiansrc@gmail.com',
        role: 'admin',
        phone: null,
      }),
    );
    // El adapter Prisma deriva must_change_password=true para rol admin.
    expect(create.mock.calls[0][0].role).toBe('admin');
  });

  it('hashea la contraseña inicial con Argon2id (vía puerto) antes de persistir', async () => {
    const hash = jest.fn().mockResolvedValue(ok('argon2-hash' as never));
    const create = jest.fn().mockImplementation((data) =>
      Promise.resolve(adminUser({ email: data.email, passwordHash: data.passwordHash })),
    );
    const uc = createUseCase({ passwordHasher: { hash }, userRepo: { create } });

    await uc.execute();

    expect(hash).toHaveBeenCalledWith('external-secret');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'argon2-hash' }),
    );
  });

  it('es no-op si el admin ya existe con must_change_password=false (no cambia hash/flag)', async () => {
    const existing = adminUser({ mustChangePassword: false });
    const findByEmail = jest.fn().mockResolvedValue(ok(existing));
    const create = jest.fn();
    const updatePassword = jest.fn();
    const hash = jest.fn();
    const uc = createUseCase({
      userRepo: { findByEmail, create, updatePassword },
      passwordHasher: { hash },
    });

    const result = await uc.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.outcome).toBe('noop');
    }
    expect(create).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('es no-op si el admin ya existe con must_change_password=true (conservador, no reescribe)', async () => {
    const existing = adminUser({ mustChangePassword: true });
    const findByEmail = jest.fn().mockResolvedValue(ok(existing));
    const create = jest.fn();
    const updatePassword = jest.fn();
    const hash = jest.fn();
    const uc = createUseCase({
      userRepo: { findByEmail, create, updatePassword },
      passwordHasher: { hash },
    });

    const result = await uc.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.outcome).toBe('noop');
    }
    expect(create).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('falla de forma segura (TECHNICAL_DEPENDENCY_FAILURE) si el correo canónico existe con rol no-admin y NO lo modifica', async () => {
    const existing = adminUser({ role: 'cliente' });
    const findByEmail = jest.fn().mockResolvedValue(ok(existing));
    const create = jest.fn();
    const updatePassword = jest.fn();
    const hash = jest.fn();
    const uc = createUseCase({
      userRepo: { findByEmail, create, updatePassword },
      passwordHasher: { hash },
    });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(create).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('falla de forma segura si el correo canónico aparece con rol no-admin dentro de la transacción (carrera)', async () => {
    const txUserRepo = stubUserRepo({
      findByEmail: jest.fn().mockResolvedValue(ok(adminUser({ role: 'cliente' }))),
    });
    const run = jest.fn().mockImplementation(async (work) =>
      ok(await work({ userRepo: txUserRepo })),
    );
    const uc = createUseCase({ unitOfWork: { run } });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('revalida dentro de la transacción atómica y no duplica si aparece en la carrera', async () => {
    const txUserRepo = stubUserRepo({
      findByEmail: jest.fn().mockResolvedValue(ok(adminUser({ mustChangePassword: false }))),
    });
    const run = jest.fn().mockImplementation(async (work) =>
      ok(await work({ userRepo: txUserRepo })),
    );
    const uc = createUseCase({ unitOfWork: { run } });

    const result = await uc.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.outcome).toBe('noop');
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('propaga el fallo técnico traducido por el adapter (sin causa/PII) y NO captura la excepción', async () => {
    // El adapter real captura la excepción del callback y devuelve
    // `fail(technicalFailure())`; la aplicación solo propaga el rail Failure.
    const run = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const uc = createUseCase({ unitOfWork: { run } });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      // No transporta la causa/mensaje/PII al rail.
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('DB down');
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('falla de forma segura si la relectura del correo falla dentro de la transacción', async () => {
    const uc = createUseCase({
      userRepo: {
        findByEmail: jest.fn().mockResolvedValue(fail(technicalFailure())),
      },
    });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('falla de forma segura si el hasher falla dentro de la transacción (no crea admin)', async () => {
    const create = jest.fn();
    const uc = createUseCase({
      passwordHasher: {
        hash: jest.fn().mockResolvedValue(fail(technicalFailure())),
      },
      userRepo: { create },
    });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('falla de forma segura si la creación del admin falla dentro de la transacción', async () => {
    const uc = createUseCase({
      userRepo: {
        create: jest.fn().mockResolvedValue(fail(technicalFailure())),
      },
    });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});