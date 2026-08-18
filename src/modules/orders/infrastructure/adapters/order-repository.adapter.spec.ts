import { OrderRepositoryAdapter } from './order-repository.adapter';

function buildMockPrisma() {
  return {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

describe('OrderRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: OrderRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new OrderRepositoryAdapter(prisma as any);
  });

  describe('findById', () => {
    it('retorna orden con items', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-001',
        userId: 'u1',
        status: 'PENDING_PAYMENT',
        itemsSubtotalCop: 10000n,
        deliveryFeeCop: 5000n,
        ivaCop: 1900n,
        taxRateBasisPoints: 1900,
        totalCop: 16900n,
        deliveryRecipientName: 'Test',
        deliveryLine1: 'Calle 1',
        deliveryCity: 'Bogotá',
        deliveryPhone: '300',
        createdAt: new Date(),
        items: [
          {
            id: 'item-1',
            productId: 'p1',
            productName: 'Product 1',
            unit: 'kg',
            unitPriceCop: 10000n,
            quantity: 1,
            subtotalCop: 10000n,
          },
        ],
      });
      const result = await adapter.findById('ord-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('ord-1');
      expect(result?.items).toHaveLength(1);
    });

    it('retorna null cuando no existe', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listByOwner', () => {
    it('retorna página de órdenes del usuario', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ORD-001',
          status: 'PAID',
          totalCop: 16900n,
          createdAt: new Date(),
        },
      ]);
      (prisma.order.count as jest.Mock).mockResolvedValue(1);
      const result = await adapter.listByOwner('u1', 1, 10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
