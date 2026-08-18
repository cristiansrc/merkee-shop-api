import { PrismaResetPasswordUnitOfWorkAdapter } from './prisma-reset-password-unit-of-work.adapter';
import { PrismaService } from '../prisma.service';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { ok, fail } from '../../../../shared/domain/result';

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
  } as unknown as PrismaService;
}

describe('PrismaResetPasswordUnitOfWorkAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaResetPasswordUnitOfWorkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaResetPasswordUnitOfWorkAdapter(prisma);
  });

  it('ejecuta work dentro de transacción y retorna ok cuando work retorna Success', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        passwordResetToken: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async (tx) => {
      expect(tx.userRepo).toBeDefined();
      expect(tx.sessionRepo).toBeDefined();
      expect(tx.passwordResetTokenRepo).toBeDefined();
      return ok(undefined);
    });

    expect(result.ok).toBe(true);
  });

  it('propaga Failure del callback como Failure', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        passwordResetToken: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async () => {
      return fail({
        code: DomainErrorCode.INVALID_DOMAIN_INPUT,
        kind: 'validation',
        messageKey: 'test',
      });
    });

    expect(result.ok).toBe(false);
  });

  it('retorna error técnico cuando la transacción falla', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB fail'));

    const result = await adapter.run(async () => ok(undefined));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});
