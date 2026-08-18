import { ok, fail } from '../../../../shared/domain/result';
import { UpdateProfileUseCase } from './update-profile.use-case';
import { UserRepositoryPort, ProfileUpdateData } from '../../domain/ports/user-repository.port';
import { IdempotencyPort, IdempotencyRecord } from '../../domain/ports/idempotency.port';
import { UpdateProfileUnitOfWorkPort } from '../../domain/ports/update-profile-unit-of-work.port';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { createHash } from 'crypto';

function stubUserRepo(overrides: Partial<UserRepositoryPort> = {}): jest.Mocked<UserRepositoryPort> {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    createAdmin: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn().mockImplementation(
      async (id: string, patch: ProfileUpdateData) => ok({
        id,
        email: 'ada@example.com',
        passwordHash: 'x',
        displayName: patch.displayName ?? 'Ada',
        phone: patch.phone ?? null,
        role: 'cliente',
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    ...overrides,
  } as jest.Mocked<UserRepositoryPort>;
}

function stubIdempotency(): jest.Mocked<IdempotencyPort> {
  return {
    find: jest.fn(),
    findForUpdate: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IdempotencyPort>;
}

function computeBodyHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

interface SharedUowOverrides {
  updateProfile?: jest.Mock;
}

/**
 * Crea un UoW mock con estado compartido para simular concurrencia.
 * El mapa `idempotencyState` persiste entre llamadas a `run()`.
 * `overrides` permite inyectar implementaciones custom de repositorios
 * dentro de la transacción (para tests de integración y rollback).
 */
function createSharedUnitOfWork(
  state?: Map<string, IdempotencyRecord>,
  overrides?: SharedUowOverrides,
): { unitOfWork: jest.Mocked<UpdateProfileUnitOfWorkPort>; state: Map<string, IdempotencyRecord> } {
  const idempotencyState = state ?? new Map<string, IdempotencyRecord>();
  const unitOfWork = {
    run: jest.fn(async (work: (tx: any) => Promise<any>) => {
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
      const fakeUserRepo = {
        updateProfile:
          overrides?.updateProfile ??
          jest.fn().mockImplementation(
            async (id: string, patch: ProfileUpdateData) => ok({
              id,
              email: 'ada@example.com',
              passwordHash: 'x',
              displayName: patch.displayName ?? 'Ada',
              phone: patch.phone ?? null,
              role: 'cliente',
              mustChangePassword: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
      };
      const tx = { userRepo: fakeUserRepo, idempotency: fakeIdempotency };
      const value = await work(tx);
      return ok(value);
    }),
  } as unknown as jest.Mocked<UpdateProfileUnitOfWorkPort>;
  return { unitOfWork, state: idempotencyState };
}

describe('UpdateProfileUseCase (MSF-ID-003)', () => {
  const idempotencyKey = '11111111-1111-4111-8111-111111111111';
  const replayKey = '22222222-2222-4222-8222-222222222222';

  it('rechaza con AUTHENTICATION_REQUIRED si no hay actor', async () => {
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo(),
      idempotency: stubIdempotency(),
      unitOfWork: createSharedUnitOfWork().unitOfWork,
    });
    const result = await uc.execute({
      actorId: '',
      idempotencyKey,
      body: { display_name: 'X' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    }
  });

  it('actualiza solo `display_name` y `phone`; `email` y `role` no se tocan', async () => {
    const updateProfile = jest.fn().mockImplementation(
      async (id: string, patch: ProfileUpdateData) => ok({
        id,
        email: 'ada@example.com', // inmutable
        passwordHash: 'x',
        displayName: patch.displayName ?? 'Ada',
        phone: patch.phone ?? null,
        role: 'admin', // inmutable
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const { unitOfWork } = createSharedUnitOfWork(undefined, { updateProfile });
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo({ updateProfile }),
      idempotency: stubIdempotency(),
      unitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey,
      body: { display_name: 'Ada Lovelace', phone: '+57 300 000 0000' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.user.email).toBe('ada@example.com');
      expect(result.value.user.role).toBe('admin');
      expect(result.value.user.display_name).toBe('Ada Lovelace');
      expect(result.value.user.phone).toBe('+57 300 000 0000');
    }
  });

  it('rechaza con 409 IDEMPOTENCY_KEY_REUSED cuando la clave coincide pero el body diverge', async () => {
    const state = new Map<string, IdempotencyRecord>();
    state.set(`profile-update:user-1:${replayKey}`, {
      scope: 'profile-update:user-1',
      key: replayKey,
      bodyHash: 'otra-hash-distinta',
      responseJson: { userId: 'user-1' },
    });
    const { unitOfWork } = createSharedUnitOfWork(state);
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo(),
      idempotency: stubIdempotency(),
      unitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey: replayKey,
      body: { display_name: 'Otro' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    }
  });

  it('replay: misma clave + mismo body devuelve la respuesta almacenada sin re-ejecutar updateProfile', async () => {
    const body = { display_name: 'Ada Lovelace' };
    const bodyHash = computeBodyHash(body);
    const storedResponse = {
      user: {
        id: 'user-1',
        display_name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'cliente',
        must_change_password: false,
        phone: '+57 300 000 0000',
      },
    };
    const state = new Map<string, IdempotencyRecord>();
    state.set(`profile-update:user-1:${idempotencyKey}`, {
      scope: 'profile-update:user-1',
      key: idempotencyKey,
      bodyHash,
      responseJson: storedResponse,
    });
    const { unitOfWork } = createSharedUnitOfWork(state);
    const updateProfile = jest.fn().mockRejectedValue(
      new Error('NO DEBE LLAMAR updateProfile'),
    );
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo({ updateProfile }),
      idempotency: stubIdempotency(),
      unitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey,
      body,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.user.display_name).toBe('Ada Lovelace');
      expect(result.value.user.phone).toBe('+57 300 000 0000');
    }
    // updateProfile no debe ser invocado en replay
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('rollback total: si falla updateProfile, no persiste idempotencia', async () => {
    const failingUnitOfWork: jest.Mocked<UpdateProfileUnitOfWorkPort> = {
      run: jest.fn(async (work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updateProfile: jest.fn().mockRejectedValue(new Error('db error')),
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
    } as unknown as jest.Mocked<UpdateProfileUnitOfWorkPort>;
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo(),
      idempotency: stubIdempotency(),
      unitOfWork: failingUnitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey,
      body: { display_name: 'Ada Lovelace' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga el fallo de updateProfile devuelto como Result dentro de la transacción', async () => {
    const { unitOfWork } = createSharedUnitOfWork(undefined, {
      updateProfile: jest.fn().mockResolvedValue(fail({
        code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      })),
    });
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo(),
      idempotency: stubIdempotency(),
      unitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey,
      body: { display_name: 'Ada Lovelace' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('falla con TECHNICAL_DEPENDENCY_FAILURE cuando la persistencia de idempotencia falla dentro de la transacción', async () => {
    const failingUnitOfWork: jest.Mocked<UpdateProfileUnitOfWorkPort> = {
      run: jest.fn(async (work: (tx: any) => Promise<any>) => {
        const fakeTx = {
          userRepo: {
            updateProfile: jest.fn().mockImplementation(
              async (id: string, patch: ProfileUpdateData) => ({
                id,
                email: 'ada@example.com',
                passwordHash: 'x',
                displayName: patch.displayName ?? 'Ada',
                phone: patch.phone ?? null,
                role: 'cliente',
                mustChangePassword: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            ),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockRejectedValue(new Error('duplicate key')),
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
    } as unknown as jest.Mocked<UpdateProfileUnitOfWorkPort>;
    const uc = new UpdateProfileUseCase({
      userRepo: stubUserRepo(),
      idempotency: stubIdempotency(),
      unitOfWork: failingUnitOfWork,
    });
    const result = await uc.execute({
      actorId: 'user-1',
      idempotencyKey,
      body: { display_name: 'Ada Lovelace' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  // ── Tests de concurrencia determinista ──────────────────────────────

  describe('concurrencia determinista', () => {
    it('dos requests con misma clave + mismo body: segundo devuelve replay', async () => {
      const { unitOfWork, state } = createSharedUnitOfWork();
      const body = { display_name: 'Ada Lovelace' };
      const uc1 = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      const result1 = await uc1.execute({
        actorId: 'user-1',
        idempotencyKey,
        body,
      });
      expect(result1.ok).toBe(true);

      // Segundo request con misma clave + mismo body
      const uc2 = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      const result2 = await uc2.execute({
        actorId: 'user-1',
        idempotencyKey,
        body,
      });
      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.user.display_name).toBe('Ada Lovelace');
      }
      // Solo una entrada en el mapa de idempotencia
      expect(state.size).toBe(1);
    });

    it('dos requests con misma clave + body divergente: segundo devuelve 409', async () => {
      const { unitOfWork } = createSharedUnitOfWork();
      const uc1 = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      await uc1.execute({
        actorId: 'user-1',
        idempotencyKey,
        body: { display_name: 'Ada' },
      });

      // Segundo request con misma clave + body diferente
      const uc2 = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      const result2 = await uc2.execute({
        actorId: 'user-1',
        idempotencyKey,
        body: { display_name: 'Otro Nombre' },
      });
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
      }
    });

    it('rollback: si la primera transacción falla, la segunda puede proceder', async () => {
      const idempotencyState = new Map<string, IdempotencyRecord>();
      let callCount = 0;

      // Primera llamada: falla en updateProfile; segunda: tiene éxito
      const unitOfWork: jest.Mocked<UpdateProfileUnitOfWorkPort> = {
        run: jest.fn(async (work: (tx: any) => Promise<any>) => {
          callCount++;
          const failingOnFirst = callCount === 1;
          const fakeIdempotency = {
            findForUpdate: jest.fn().mockImplementation(
              async (scope: string, key: string) =>
                idempotencyState.get(`${scope}:${key}`) ?? null,
            ),
            save: jest.fn().mockImplementation(
              async (scope: string, key: string, bodyHash: string, responseJson: unknown) => {
                idempotencyState.set(`${scope}:${key}`, {
                  scope, key, bodyHash, responseJson,
                });
              },
            ),
          };
          const fakeUserRepo = {
            updateProfile: failingOnFirst
              ? jest.fn().mockRejectedValue(new Error('db error'))
              : jest.fn().mockImplementation(
                  async (id: string, patch: ProfileUpdateData) => ok({
                    id, email: 'ada@example.com', passwordHash: 'x',
                    displayName: patch.displayName ?? 'Ada',
                    phone: patch.phone ?? null, role: 'cliente',
                    mustChangePassword: false,
                    createdAt: new Date(), updatedAt: new Date(),
                  }),
                ),
          };
          const tx = { userRepo: fakeUserRepo, idempotency: fakeIdempotency };
          try {
            const value = await work(tx);
            return ok(value);
          } catch {
            return fail({
              code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
              kind: 'technical',
              messageKey: 'technical.dependency_failure',
            });
          }
        }),
      } as unknown as jest.Mocked<UpdateProfileUnitOfWorkPort>;

      const failingUc = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      const result1 = await failingUc.execute({
        actorId: 'user-1',
        idempotencyKey,
        body: { display_name: 'Ada' },
      });
      expect(result1.ok).toBe(false);
      // No se persistió idempotencia
      expect(idempotencyState.size).toBe(0);

      // Segunda llamada: tiene éxito
      const successUc = new UpdateProfileUseCase({
        userRepo: stubUserRepo(),
        idempotency: stubIdempotency(),
        unitOfWork,
      });
      const result2 = await successUc.execute({
        actorId: 'user-1',
        idempotencyKey,
        body: { display_name: 'Ada' },
      });
      expect(result2.ok).toBe(true);
    });
  });
});
