import { PrismaBootstrapUnitOfWorkAdapter } from './prisma-bootstrap-unit-of-work.adapter';
import { isSuccess, isFailure, ok } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

/**
 * Construye un cliente de transacción Prisma falso con los delegados que usa
 * `PrismaUserRepositoryAdapter` dentro de la transacción de bootstrap.
 */
function fakeTx() {
  const now = new Date('2026-08-15T12:00:00.000Z');
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'admin-1',
        email: 'cristiansrc@gmail.com',
        passwordHash: 'argon2-hash',
        displayName: 'Admin',
        phone: null,
        role: 'admin',
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      }),
      update: jest.fn(),
    },
  };
}

/** Construye un PrismaService falso cuyo $transaction invoca el callback. */
function fakePrisma(tx: ReturnType<typeof fakeTx>) {
  return {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
}

describe('PrismaBootstrapUnitOfWorkAdapter', () => {
  it('ejecuta el trabajo en una transacción y devuelve el resultado', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaBootstrapUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async (t) => {
      await t.userRepo.create({
        email: 'cristiansrc@gmail.com',
        passwordHash: 'argon2-hash',
        displayName: 'Admin',
        phone: null,
        role: 'admin',
      });
      return 'created';
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toBe('created');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
  });

  it('traduce el fallo del trabajo (rollback total) a TECHNICAL_DEPENDENCY_FAILURE sin causa/PII', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaBootstrapUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async () => {
      throw new Error('connection refused with PII');
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      // No transporta la causa/mensaje/PII al rail.
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('connection refused');
      expect(JSON.stringify(result.error)).not.toContain('PII');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('traduce un fallo Prisma (código) a TECHNICAL_DEPENDENCY_FAILURE sin propagar el mensaje', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on email: admin@example.com',
      }),
    };
    const adapter = new PrismaBootstrapUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async () => 'never');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      // El mensaje Prisma (que puede contener PII como el email) no se propaga.
      expect(JSON.stringify(result.error)).not.toContain('admin@example.com');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});