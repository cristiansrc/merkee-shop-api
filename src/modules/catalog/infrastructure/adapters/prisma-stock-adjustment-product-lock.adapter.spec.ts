import { PrismaStockAdjustmentProductLockAdapter } from './prisma-stock-adjustment-product-lock.adapter';

function buildMockPrisma() {
  return {
    $queryRaw: jest.fn(),
    product: {
      update: jest.fn(),
    },
  };
}

describe('PrismaStockAdjustmentProductLockAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaStockAdjustmentProductLockAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaStockAdjustmentProductLockAdapter(prisma as any);
  });

  describe('lockForUpdate', () => {
    it('retorna registro de producto con lock', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: 'p1', stock_on_hand: 100, stock_reserved: 10 },
      ]);
      const result = await adapter.lockForUpdate('p1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
      expect(result?.stockOnHand).toBe(100);
    });

    it('retorna null cuando el producto no existe', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await adapter.lockForUpdate('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateStockOnHand', () => {
    it('actualiza stock exitosamente', async () => {
      (prisma.product.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.updateStockOnHand('p1', 50);
      expect(result).toBe(true);
    });

    it('retorna false cuando falla', async () => {
      (prisma.product.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.updateStockOnHand('p1', 50);
      expect(result).toBe(false);
    });
  });
});
