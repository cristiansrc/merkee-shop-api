import { PrismaActivateAdminUnitOfWorkAdapter } from './prisma-activate-admin-unit-of-work.adapter';
import { isFailure, isSuccess } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

/**
 * Construye un cliente de transacción Prisma falso con los delegados que usan
 * los adapters de repositorio dentro de la transacción de activación de admin.
 */
function fakeTx() {
  const now = new Date('2026-08-15T12:00:00.000Z');
  return {
    user: {
      update: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        passwordHash: 'argon2-hash',
        displayName: 'A',
        phone: null,
        role: 'admin',
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      }),
    },
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    adminActivationToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

describe('PrismaActivateAdminUnitOfWorkAdapter', () => {
  it('ejecuta el trabajo en una única transacción y devuelve el resultado', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaActivateAdminUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async (t) => {
      await t.activationTokenRepo.consumeUnused('t1', new Date());
      await t.userRepo.updatePassword('u1', 'argon2-hash');
      await t.sessionRepo.revokeAllForUser('u1');
      return 'activated';
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) expect(result.value).toBe('activated');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Consumo atómico del token dentro de la transacción.
    expect(tx.adminActivationToken.updateMany).toHaveBeenCalledTimes(1);
    // Actualización de contraseña y revocación de sesiones en la misma tx.
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.session.updateMany).toHaveBeenCalledTimes(1);
  });

  it('traduce el fallo del trabajo a Result sin causa ni PII', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaActivateAdminUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async () => {
      throw new Error('business failure with email@example.com');
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('email@example.com');
    }
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Ninguna escritura llegó a ejecutarse porque el callback lanzó antes.
    expect(tx.adminActivationToken.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('traduce el fallo posterior a escrituras y conserva el rollback', async () => {
    const tx = fakeTx();
    const prisma = fakePrisma(tx);
    const adapter = new PrismaActivateAdminUnitOfWorkAdapter(prisma as never);

    const result = await adapter.run(async (t) => {
      await t.activationTokenRepo.consumeUnused('t1', new Date());
      await t.userRepo.updatePassword('u1', 'argon2-hash');
      // Falla después de escribir: Prisma revierte todo.
      throw new Error('late failure');
    });

    expect(isFailure(result)).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.adminActivationToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
});
