import { PrismaProvisionUnitOfWorkAdapter } from './prisma-provision-unit-of-work.adapter';
import { isSuccess, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

/**
 * Construye un cliente de transacción Prisma falso con los delegados que usan
 * los adapters de repositorio dentro de la transacción de provisión.
 */
function fakeTx() {
  const now = new Date('2026-08-15T12:00:00.000Z');
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      create: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        passwordHash: 'placeholder',
        displayName: 'A',
        phone: null,
        role: 'admin',
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    adminActivationToken: {
      create: jest.fn().mockResolvedValue({
        id: 't1',
        userId: 'u1',
        tokenHash: 'hashed',
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        usedAt: null,
        createdByUserId: 'actor-1',
        createdAt: now,
        updatedAt: now,
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    idempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'i1',
        scope: 'admin-provision:actor-1',
        idempotencyKey: 'key-1',
        bodyHash: 'hash',
        response: {},
        createdAt: now,
        updatedAt: now,
      }),
      deleteMany: jest.fn(),
    },
  };
}

/** Construye un PrismaService falso cuyo $transaction invoca el callback. */
function fakePrisma(tx: ReturnType<typeof fakeTx>) {
  return {
    $transaction: jest.fn(
      async (cb: (t: unknown) => unknown, _opts?: unknown) => cb(tx),
    ),
  };
}

describe('PrismaProvisionUnitOfWorkAdapter', () => {
  it('ejecuta el trabajo en una transacción SERIALIZABLE con advisory lock y devuelve el resultado', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('admin-provision:actor-1', 'key-1', async (t) => {
      await t.userRepo.createAdmin({
        email: 'a@b.co',
        displayName: 'A',
        phone: null,
      });
      await t.idempotencyRepo.save('admin-provision:actor-1', 'key-1', 'hash', {
        id: 'u1',
      });
      return 'ok';
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('ok');
    }
    // Transacción interactiva con aislamiento SERIALIZABLE.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'Serializable',
    });
    // Advisory lock transaccional derivado de SHA-256(scope || 0x00 || key).
    // `$executeRaw` es un tagged template: la clave decimal viaja en los valores.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const lockArg = tx.$executeRaw.mock.calls[0][1];
    expect(typeof lockArg).toBe('string');
    expect(lockArg).toMatch(/^\d+$/);
  });

  it('traduce el fallo del trabajo (rollback total) a TECHNICAL_DEPENDENCY_FAILURE sin reintentar errores no reintentables', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => {
      throw new Error('business failure');
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      // No transporta la causa/mensaje/PII al rail.
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('business failure');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reintenta ante aborto de serialización (P2034) y devuelve el resultado del reintento', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    // Primer intento aborta por serialización; el segundo tiene éxito.
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (cb: (t: unknown) => unknown) => cb(tx));
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'retried');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('retried');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('reintenta ante conflicto de unicidad (P2002) de la clave de idempotencia y devuelve el resultado del reintento', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    prisma.$transaction
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['scope', 'idempotency_key'] },
      })
      .mockImplementationOnce(async (cb: (t: unknown) => unknown) => cb(tx));
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'retried');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('retried');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE tras agotar los tres reintentos de serialización', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    };
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'never');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('reintenta un P2002 de la clave de idempotencia (target array) para resolver replay', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    prisma.$transaction
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['scope', 'idempotency_key'] },
      })
      .mockImplementationOnce(async (cb: (t: unknown) => unknown) => cb(tx));
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'replayed');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('replayed');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('reintenta un P2002 de la clave de idempotencia (target por nombre de restricción)', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    prisma.$transaction
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: 'idempotency_records_scope_idempotency_key_key' },
      })
      .mockImplementationOnce(async (cb: (t: unknown) => unknown) => cb(tx));
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'replayed');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('replayed');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta un P2002 de otra restricción (p. ej. email único) y lo traduce a TECHNICAL_DEPENDENCY_FAILURE', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email'] },
      }),
    };
    const adapter = new PrismaProvisionUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run('scope', 'key', async () => 'never');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    // No se reintenta: un P2002 ajeno a la idempotencia no debe ocultarse
    // como replay.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
