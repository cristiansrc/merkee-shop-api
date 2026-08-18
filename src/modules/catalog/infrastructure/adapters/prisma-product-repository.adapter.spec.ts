import { PrismaProductRepositoryAdapter } from './prisma-product-repository.adapter';

function buildMockPrisma() {
  return {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productImage: {
      deleteMany: jest.fn(),
    },
  };
}

function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    categoryId: 'cat-1',
    name: 'Product 1',
    description: 'Description 1',
    regularPriceCop: 10000n,
    salePriceCop: 8000n,
    unit: 'kg',
    stockOnHand: 100,
    stockReserved: 10,
    version: 1,
    deletedAt: null,
    images: [
      { id: 'img-1', productId: 'p1', key: 'key-1', altText: 'alt', position: 0 },
    ],
    ...overrides,
  };
}

describe('PrismaProductRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaProductRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaProductRepositoryAdapter(prisma as any);
  });

  describe('findById', () => {
    it('retorna producto con imágenes', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.findById('p1');
      expect(result).not.toBeNull();
      expect(result?.product.id).toBe('p1');
      expect(result?.images).toHaveLength(1);
    });

    it('retorna null cuando no existe', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listActive', () => {
    it('retorna página de productos activos', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);
      const result = await adapter.listActive(1, 10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('listActiveByCategory', () => {
    it('retorna productos filtrados por categoría', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);
      const result = await adapter.listActiveByCategory('cat-1', 1, 10);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('searchActive', () => {
    it('retorna productos que coinciden con la búsqueda', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);
      const result = await adapter.searchActive('test', 1, 10);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('listAll', () => {
    it('retorna todos los productos', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      (prisma.product.count as jest.Mock).mockResolvedValue(1);
      const result = await adapter.listAll(1, 10);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('crea producto con imágenes', async () => {
      (prisma.product.create as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.create({
        categoryId: 'cat-1',
        name: 'Product 1',
        description: 'Description 1',
        regularPriceCop: 10000n,
        salePriceCop: 8000n,
        unit: 'kg',
        stockOnHand: 100,
        images: [{ key: 'key-1', altText: 'alt', position: 0 }],
      });
      expect(result.product.id).toBe('p1');
    });
  });

  describe('update', () => {
    it('actualiza producto exitosamente', async () => {
      (prisma.productImage.deleteMany as jest.Mock).mockResolvedValue({});
      (prisma.product.update as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.update('p1', 1, {
        categoryId: 'cat-1',
        name: 'Updated',
        description: 'Desc',
        regularPriceCop: 10000n,
        salePriceCop: 8000n,
        unit: 'kg',
        images: [],
      });
      expect(result).not.toBeNull();
    });

    it('retorna null cuando la versión no coincide', async () => {
      (prisma.productImage.deleteMany as jest.Mock).mockResolvedValue({});
      (prisma.product.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.update('p1', 999, {
        categoryId: 'cat-1',
        name: 'Updated',
        description: 'Desc',
        regularPriceCop: 10000n,
        salePriceCop: 8000n,
        unit: 'kg',
        images: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('marca producto como eliminado', async () => {
      (prisma.product.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.softDelete('p1');
      expect(result).toBe(true);
    });

    it('retorna false cuando el producto no existe', async () => {
      (prisma.product.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.softDelete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
