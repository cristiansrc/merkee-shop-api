import { PrismaUpdateProfileUnitOfWorkAdapter } from './prisma-update-profile-unit-of-work.adapter';
import { PrismaService } from '../prisma.service';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
  } as unknown as PrismaService;
}

describe('PrismaUpdateProfileUnitOfWorkAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaUpdateProfileUnitOfWorkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaUpdateProfileUnitOfWorkAdapter(prisma);
  });

  it('ejecuta work dentro de transacción y retorna ok', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        idempotencyRecord: { findUnique: jest.fn(), create: jest.fn() },
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async (tx) => {
      expect(tx.userRepo).toBeDefined();
      expect(tx.idempotency).toBeDefined();
      return 'profile-updated';
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('profile-updated');
  });

  it('retorna error técnico cuando la transacción falla', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB fail'));

    const result = await adapter.run(async () => 'never');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});
