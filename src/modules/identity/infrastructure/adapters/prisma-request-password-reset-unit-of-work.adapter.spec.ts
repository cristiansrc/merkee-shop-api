import { PrismaRequestPasswordResetUnitOfWorkAdapter } from './prisma-request-password-reset-unit-of-work.adapter';
import { PrismaService } from '../prisma.service';
import { DomainErrorCode, DomainError } from '../../../../shared/domain/domain-error';

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
  } as unknown as PrismaService;
}

describe('PrismaRequestPasswordResetUnitOfWorkAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaRequestPasswordResetUnitOfWorkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaRequestPasswordResetUnitOfWorkAdapter(prisma);
  });

  it('ejecuta work dentro de transacción y retorna ok', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        passwordResetToken: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async (tx) => {
      expect(tx.userRepo).toBeDefined();
      expect(tx.passwordResetTokenRepo).toBeDefined();
    });

    expect(result.ok).toBe(true);
  });

  it('retorna error técnico cuando la transacción falla', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB fail'));

    const result = await adapter.run(async () => {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('propaga DomainError del callback como Failure', async () => {
    const domainError: DomainError = {
      code: DomainErrorCode.INVALID_DOMAIN_INPUT,
      kind: 'validation',
      messageKey: 'test',
    };
    (prisma.$transaction as jest.Mock).mockRejectedValue(domainError);

    const result = await adapter.run(async () => {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.INVALID_DOMAIN_INPUT);
    }
  });
});
