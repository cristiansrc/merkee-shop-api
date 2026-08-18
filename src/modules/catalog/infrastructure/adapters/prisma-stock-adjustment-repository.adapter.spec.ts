import { PrismaStockAdjustmentRepositoryAdapter } from './prisma-stock-adjustment-repository.adapter';

function buildMockPrisma() {
  return {
    productStockAdjustment: {
      create: jest.fn(),
    },
  };
}

describe('PrismaStockAdjustmentRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaStockAdjustmentRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaStockAdjustmentRepositoryAdapter(prisma as any);
  });

  describe('insert', () => {
    it('inserta ajuste de stock exitosamente', async () => {
      (prisma.productStockAdjustment.create as jest.Mock).mockResolvedValue({
        id: 'adj-1',
        productId: 'p1',
        adminUserId: 'admin-1',
        quantityDelta: 10,
        reason: 'Restock',
        stockOnHandBefore: 90,
        stockOnHandAfter: 100,
        stockReserved: 5,
        stockAvailable: 95,
        idempotencyKey: 'key-1',
        createdAt: new Date(),
      });
      const result = await adapter.insert({
        productId: 'p1',
        adminUserId: 'admin-1',
        quantityDelta: 10,
        reason: 'Restock',
        stockOnHandBefore: 90,
        stockOnHandAfter: 100,
        stockReserved: 5,
        stockAvailable: 95,
        idempotencyKey: 'key-1',
      });
      expect(result.id).toBe('adj-1');
      expect(result.productId).toBe('p1');
    });
  });
});
