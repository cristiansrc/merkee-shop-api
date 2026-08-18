import { createHash } from 'crypto';
import { ProvisionAdminUserUseCase } from './provision-admin-user.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { AdminActivationTokenRepositoryPort } from '../../domain/ports/admin-activation-token-repository.port';
import { IdempotencyPort } from '../../domain/ports/idempotency.port';
import { ProvisionUnitOfWorkPort } from '../../domain/ports/provision-unit-of-work.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { User } from '../../domain/models/user';
import {
  isSuccess,
  isFailure,
  ok,
  fail,
} from '../../../../shared/domain/result';
import type { Result } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

/** Hash canónico del cuerpo del comando (mismo algoritmo que el caso de uso). */
function commandBodyHash(cmd: typeof command): string {
  const canonical = JSON.stringify({
    display_name: cmd.displayName,
    email: cmd.email.toLowerCase().trim(),
    phone: cmd.phone ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

const adminActor: User = {
  id: 'actor-1',
  email: 'admin@example.com',
  passwordHash: 'hash',
  displayName: 'Admin',
  phone: null,
  role: 'admin',
  mustChangePassword: false,
  createdAt: fixedDate,
  updatedAt: fixedDate,
};

const adminPending: User = {
  id: 'new-admin-1',
  email: 'newadmin@example.com',
  passwordHash: 'placeholder',
  displayName: 'Nuevo Admin',
  phone: null,
  role: 'admin',
  mustChangePassword: true,
  createdAt: fixedDate,
  updatedAt: fixedDate,
};

function stubUserRepo(overrides?: Partial<UserRepositoryPort>): UserRepositoryPort {
  return {
    findByEmail: jest.fn().mockResolvedValue(ok(null)),
    findById: jest.fn().mockResolvedValue(ok(adminActor)),
    create: jest.fn(),
    createAdmin: jest.fn().mockResolvedValue(ok(adminPending)),
    updatePassword: jest.fn().mockResolvedValue(ok({} as User)),
    updateProfile: jest.fn().mockResolvedValue(ok({} as User)),
    ...overrides,
  };
}

function stubActivationTokenRepo(
  overrides?: Partial<AdminActivationTokenRepositoryPort>,
): AdminActivationTokenRepositoryPort {
  return {
    findByTokenHash: jest.fn().mockResolvedValue(null),
    findActiveByUserId: jest.fn().mockResolvedValue({
      id: 'token-1',
      userId: 'new-admin-1',
      tokenHash: 'hashed-token',
      expiresAt: new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000),
      usedAt: null,
      createdByUserId: 'actor-1',
      createdAt: fixedDate,
      updatedAt: fixedDate,
    }),
    create: jest.fn().mockResolvedValue({
      id: 'token-1',
      userId: 'new-admin-1',
      tokenHash: 'hashed-token',
      expiresAt: new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000),
      usedAt: null,
      createdByUserId: 'actor-1',
      createdAt: fixedDate,
      updatedAt: fixedDate,
    }),
    revokeExpiredUnused: jest.fn().mockResolvedValue(undefined),
    consumeUnused: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function stubIdempotencyRepo(overrides?: Partial<IdempotencyPort>): IdempotencyPort {
  return {
    find: jest.fn().mockResolvedValue(null),
    findForUpdate: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function stubCookieToken(overrides?: Partial<CookieTokenPort>): CookieTokenPort {
  return {
    generate: jest.fn().mockReturnValue('raw-activation-token'),
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
 * Stub de la unidad de trabajo: ejecuta el callback con los repositorios
 * transaccionales y devuelve `Result`. Imita el contrato del adapter real:
 * captura las excepciones técnicas del callback en su límite y las traduce a
 * `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP). Permite simular el
 * resultado de la transacción (created, replay, conflict, emailTaken,
 * actorNotAuthorized, initialPasswordChangeRequired) o un fallo técnico.
 */
function stubUnitOfWork(
  txRepos: {
    userRepo?: Partial<UserRepositoryPort>;
    activationTokenRepo?: Partial<AdminActivationTokenRepositoryPort>;
    idempotencyRepo?: Partial<IdempotencyPort>;
  },
  overrides?: Partial<ProvisionUnitOfWorkPort>,
): ProvisionUnitOfWorkPort {
  return {
    run: jest.fn(async (_scope, _key, work) => {
      try {
        const value = await work({
          userRepo: stubUserRepo(txRepos.userRepo),
          activationTokenRepo: stubActivationTokenRepo(txRepos.activationTokenRepo),
          idempotencyRepo: stubIdempotencyRepo(txRepos.idempotencyRepo),
        });
        return ok(value);
      } catch {
        return fail(technicalFailure());
      }
    }),
    ...overrides,
  } as ProvisionUnitOfWorkPort;
}

function createUseCase(overrides?: {
  outerUserRepo?: Partial<UserRepositoryPort>;
  tx?: {
    userRepo?: Partial<UserRepositoryPort>;
    activationTokenRepo?: Partial<AdminActivationTokenRepositoryPort>;
    idempotencyRepo?: Partial<IdempotencyPort>;
  };
  unitOfWork?: Partial<ProvisionUnitOfWorkPort>;
  clock?: Partial<ClockPort>;
  cookieToken?: Partial<CookieTokenPort>;
}): ProvisionAdminUserUseCase {
  return new ProvisionAdminUserUseCase({
    userRepo: stubUserRepo(overrides?.outerUserRepo),
    clock: stubClock(overrides?.clock),
    provisionUnitOfWork: stubUnitOfWork(
      overrides?.tx ?? {},
      overrides?.unitOfWork,
    ),
    cookieToken: stubCookieToken(overrides?.cookieToken),
  });
}

const command = {
  actorId: 'actor-1',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  displayName: 'Nuevo Admin',
  email: 'newadmin@example.com',
  phone: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProvisionAdminUserUseCase', () => {
  it('provisiona un admin y devuelve la respuesta contractual sin token ni contraseña', async () => {
    const uc = createUseCase();
    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.id).toBe('new-admin-1');
      expect(result.value.role).toBe('admin');
      expect(result.value.must_change_password).toBe(true);
      expect(result.value.activation_expires_at).toBe(
        new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      );
      // Nunca expone token ni contraseña (valores sensibles, no la palabra).
      const serialized = JSON.stringify(result.value);
      expect(serialized).not.toContain('raw-activation-token');
      expect(serialized).not.toContain('hashed-activation-token');
      expect(serialized).not.toContain('NuevaContraseña');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('token_hash');
    }
  });

  it('persiste solo el hash del token de activación con expiración de 24h', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'token-1',
      userId: 'new-admin-1',
      tokenHash: 'hashed-activation-token',
      expiresAt: new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000),
      usedAt: null,
      createdByUserId: 'actor-1',
      createdAt: fixedDate,
      updatedAt: fixedDate,
    });
    const uc = createUseCase({
      tx: { activationTokenRepo: { create } },
    });

    await uc.execute(command);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'new-admin-1',
        tokenHash: 'hashed-activation-token',
        createdByUserId: 'actor-1',
      }),
    );
    // El token en claro nunca se persiste.
    expect(create.mock.calls[0][0].tokenHash).not.toContain('raw-activation-token');
  });

  it('revoca el token no usado expirado antes de reemitir', async () => {
    const revokeExpiredUnused = jest.fn().mockResolvedValue(undefined);
    const uc = createUseCase({
      tx: { activationTokenRepo: { revokeExpiredUnused } },
    });

    await uc.execute(command);

    expect(revokeExpiredUnused).toHaveBeenCalledWith('new-admin-1', fixedDate);
  });

  it('rechaza con AUTHENTICATION_REQUIRED si no hay actor autenticado', async () => {
    const uc = createUseCase();
    const result = await uc.execute({ ...command, actorId: '' });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('rechaza con ACTOR_NOT_AUTHORIZED si el actor no es admin', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok({
            ...adminActor,
            role: 'cliente',
          })),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    }
  });

  it('rechaza con INITIAL_PASSWORD_CHANGE_REQUIRED si el admin debe cambiar contraseña', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok({
            ...adminActor,
            mustChangePassword: true,
          })),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
      );
    }
  });

  it('rechaza con EMAIL_ALREADY_REGISTERED si el email ya existe', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findByEmail: jest.fn().mockResolvedValue(ok(adminPending)),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.EMAIL_ALREADY_REGISTERED);
    }
  });

  it('reproduce el 201 original en reintento idempotente con misma clave y cuerpo', async () => {
    // La DB solo guarda la instantánea mínima (sin PII); el replay reconstruye
    // la respuesta contractual desde el recurso vigente en DB (usuario + token),
    // nunca desde el comando de replay.
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: commandBodyHash(command),
    };
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn(async (id: string) => {
            // Autorización (actor) y replay (recurso provisionado) usan el
            // mismo puerto; el actor es admin con contraseña cambiada.
            if (id === 'actor-1') return ok(adminActor);
            return ok(adminPending);
          }),
        },
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            responseJson: snapshot,
          }),
        },
      },
    });

    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toEqual({
        id: 'new-admin-1',
        display_name: adminPending.displayName,
        email: adminPending.email,
        role: 'admin',
        must_change_password: true,
        phone: adminPending.phone,
        activation_expires_at: '2026-08-16T12:00:00.000Z',
      });
    }
  });

  it('reconstruye el replay tras la activación conservando must_change_password=true', async () => {
    // Tras la activación el recurso tiene `must_change_password=false`, pero el
    // replay conserva la constante contractual de la provisión original.
    const activatedUser: User = {
      ...adminPending,
      mustChangePassword: false,
    };
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: commandBodyHash(command),
    };
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn().mockResolvedValue(ok(activatedUser)),
        },
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            responseJson: snapshot,
          }),
        },
      },
    });

    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.must_change_password).toBe(true);
      expect(result.value.id).toBe('new-admin-1');
      expect(result.value.role).toBe('admin');
    }
  });

  it('devuelve error seguro si el recurso provisionado ya no existe en el replay', async () => {
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: commandBodyHash(command),
    };
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn(async (id: string) => {
            // El actor es admin válido; el recurso provisionado ya no existe.
            if (id === 'actor-1') return ok(adminActor);
            return ok(null);
          }),
        },
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            responseJson: snapshot,
          }),
        },
      },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('newadmin@example.com');
    }
  });

  it('rechaza con IDEMPOTENCY_KEY_REUSED en reproducción divergente', async () => {
    const uc = createUseCase({
      tx: {
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: 'different-hash',
                  responseJson: { id: 'other' },
          }),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('reproduce el resultado concurrente si la transacción resolvió la carrera con igual cuerpo', async () => {
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: commandBodyHash(command),
    };
    // La unidad de trabajo (adapter) resuelve la carrera: tras el conflicto de
    // unicidad relee el registro y devuelve replay con el mismo cuerpo.
    const uc = createUseCase({
      unitOfWork: {
        run: jest.fn(async (_scope, _key, work) => {
          return ok(
            await work({
              userRepo: stubUserRepo({
                findById: jest.fn(async (id: string) => {
                  if (id === 'actor-1') return ok(adminActor);
                  return ok(adminPending);
                }),
              }),
              activationTokenRepo: stubActivationTokenRepo(),
              idempotencyRepo: stubIdempotencyRepo({
                findForUpdate: jest.fn().mockResolvedValue({
                  scope: 'admin-provision:actor-1',
                  key: command.idempotencyKey,
                  bodyHash: commandBodyHash(command),
                  responseJson: snapshot,
                }),
              }),
            }),
          );
        }) as ProvisionUnitOfWorkPort['run'],
      },
    });

    const result = await uc.execute(command);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toEqual({
        id: 'new-admin-1',
        display_name: adminPending.displayName,
        email: adminPending.email,
        role: 'admin',
        must_change_password: true,
        phone: adminPending.phone,
        activation_expires_at: '2026-08-16T12:00:00.000Z',
      });
    }
  });

  it('rechaza con IDEMPOTENCY_KEY_REUSED si la clave concurrente tiene cuerpo divergente', async () => {
    const uc = createUseCase({
      unitOfWork: {
        run: jest.fn(async (_scope, _key, work) => {
          return ok(
            await work({
              userRepo: stubUserRepo(),
              activationTokenRepo: stubActivationTokenRepo(),
              idempotencyRepo: stubIdempotencyRepo({
                findForUpdate: jest.fn().mockResolvedValue({
                  scope: 'admin-provision:actor-1',
                  key: command.idempotencyKey,
                  bodyHash: 'different-hash',
            responseJson: { id: 'other' },
                }),
              }),
            }),
          );
        }) as ProvisionUnitOfWorkPort['run'],
      },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si la transacción agota los reintentos', async () => {
    const uc = createUseCase({
      unitOfWork: {
        run: jest.fn().mockResolvedValue(fail(technicalFailure())),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE ante error inesperado', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
  });

  it('no filtra la causa técnica al rail HTTP (sin metadata/details)', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn().mockRejectedValue(
            new Error('connection to newadmin@example.com failed'),
          ),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('newadmin@example.com');
      expect(JSON.stringify(result.error)).not.toContain('connection');
    }
  });

  it('persiste en response_json solo la instantánea mínima sin PII', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const uc = createUseCase({
      tx: { idempotencyRepo: { save } },
    });

    await uc.execute(command);

    expect(save).toHaveBeenCalledTimes(1);
    const persisted = save.mock.calls[0][3] as Record<string, unknown>;
    expect(persisted).toEqual({
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: new Date(
        fixedDate.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
      body_hash: commandBodyHash(command),
    });
    // Nunca persiste email/display_name/phone ni secretos.
    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain('newadmin@example.com');
    expect(serialized).not.toContain('Nuevo Admin');
    expect(serialized).not.toContain('display_name');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
  });

  it('rechaza con IDEMPOTENCY_KEY_REUSED si el body_hash de la instantánea no coincide', async () => {
    // Replay contractual: aunque el body_hash de la columna coincida, si la
    // instantánea persistida tiene un body_hash divergente se trata como
    // reproducción divergente (409), nunca como replay.
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: 'stale-snapshot-hash',
    };
    const uc = createUseCase({
      tx: {
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            responseJson: snapshot,
          }),
        },
      },
    });

    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('rechaza con EMAIL_ALREADY_REGISTERED sin filtrar el email', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findByEmail: jest.fn().mockResolvedValue(ok(adminPending)),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.EMAIL_ALREADY_REGISTERED);
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('newadmin@example.com');
    }
  });

  it('rechaza con AUTHENTICATION_REQUIRED si el actor no existe fuera de la transacción', async () => {
    const uc = createUseCase({
      outerUserRepo: {
        findById: jest.fn().mockResolvedValue(ok(null)),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('rechaza con ACTOR_NOT_AUTHORIZED si el actor no es admin fuera de la transacción', async () => {
    const uc = createUseCase({
      outerUserRepo: {
        findById: jest.fn().mockResolvedValue(ok({
          ...adminActor,
          role: 'cliente',
        })),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    }
  });

  it('rechaza con INITIAL_PASSWORD_CHANGE_REQUIRED si el actor debe cambiar contraseña fuera de la transacción', async () => {
    const uc = createUseCase({
      outerUserRepo: {
        findById: jest.fn().mockResolvedValue(ok({
          ...adminActor,
          mustChangePassword: true,
        })),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
      );
    }
  });

  it('rechaza con EMAIL_ALREADY_REGISTERED si el email ya existe fuera de la transacción', async () => {
    const uc = createUseCase({
      outerUserRepo: {
        findByEmail: jest.fn().mockResolvedValue(ok(adminPending)),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.EMAIL_ALREADY_REGISTERED);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si la verificación de email falla dentro de la transacción', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          findByEmail: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si la relectura del recurso falla en el replay', async () => {
    const snapshot = {
      resource_id: 'new-admin-1',
      status: 201,
      activation_expires_at: '2026-08-16T12:00:00.000Z',
      body_hash: commandBodyHash(command),
    };
    const uc = createUseCase({
      tx: {
        userRepo: {
          findById: jest.fn(async (id: string): Promise<Result<User | null, DomainError>> => {
            if (id === 'actor-1') return ok(adminActor);
            return fail(technicalFailure());
          }),
        },
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            responseJson: snapshot,
          }),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('rechaza con IDEMPOTENCY_KEY_REUSED si el snapshot persistido tiene forma inesperada', async () => {
    const uc = createUseCase({
      tx: {
        idempotencyRepo: {
          findForUpdate: jest.fn().mockResolvedValue({
            scope: 'admin-provision:actor-1',
            key: command.idempotencyKey,
            bodyHash: commandBodyHash(command),
            // Snapshot sin resource_id string → forma corrupta/inesperada.
            responseJson: { id: 'other' },
          }),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si la creación del admin falla dentro de la transacción', async () => {
    const uc = createUseCase({
      tx: {
        userRepo: {
          createAdmin: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si el outcome transaccional no trae usuario', async () => {
    const uc = createUseCase({
      unitOfWork: {
        run: jest.fn().mockResolvedValue(ok({ kind: 'created' as const })),
      },
    });
    const result = await uc.execute(command);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});
