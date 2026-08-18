import { CheckoutProductLookupAdapter } from './checkout-product-lookup.adapter';

function buildMockPrisma() {
  return {
    product: {
      findMany: jest.fn(),
    },
  };
}

describe('CheckoutProductLookupAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: CheckoutProductLookupAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new CheckoutProductLookupAdapter(prisma as any);
  });

  describe('findByIds', () => {
    it('retorna mapa de productos por ids', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p1',
          name: 'Product 1',
          regularPriceCop: 10000n,
          salePriceCop: 8000n,
          unit: 'kg',
        },
        {
          id: 'p2',
          name: 'Product 2',
          regularPriceCop: 5000n,
          salePriceCop: 5000n,
          unit: 'unit',
        },
      ]);
      const result = await adapter.findByIds(['p1', 'p2']);
      expect(result.size).toBe(2);
      expect(result.get('p1')?.name).toBe('Product 1');
    });

    it('retorna mapa vacío cuando no hay ids', async () => {
      const result = await adapter.findByIds([]);
      expect(result.size).toBe(0);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('retorna solo los productos encontrados', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p1',
          name: 'Product 1',
          regularPriceCop: 10000n,
          salePriceCop: 8000n,
          unit: 'kg',
        },
      ]);
      const result = await adapter.findByIds(['p1', 'nonexistent']);
      expect(result.size).toBe(1);
      expect(result.has('p1')).toBe(true);
      expect(result.has('nonexistent')).toBe(false);
    });
  });
});
