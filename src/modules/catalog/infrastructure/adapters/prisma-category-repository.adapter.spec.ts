import { PrismaCategoryRepositoryAdapter } from './prisma-category-repository.adapter';

function buildMockPrisma() {
  return {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
  };
}

function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'cat-1',
    name: 'Category 1',
    imageKey: 'key-1',
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('PrismaCategoryRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaCategoryRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaCategoryRepositoryAdapter(prisma as any);
  });

  describe('listAll', () => {
    it('retorna todas las categorías', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      const result = await adapter.listAll();
      expect(result).toHaveLength(1);
    });

    it('excluye categorías soft-deleted', async () => {
      const active = makeRow({ id: 'cat-active', deletedAt: null });
      const deleted = makeRow({ id: 'cat-deleted', deletedAt: new Date() });
      (prisma.category.findMany as jest.Mock).mockResolvedValue([active]);

      const result = await adapter.listAll();
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cat-active');
    });
  });

  describe('listActive', () => {
    it('retorna categorías activas', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      const result = await adapter.listActive();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('retorna categoría por id', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.findById('cat-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cat-1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findActiveById', () => {
    it('retorna categoría activa por id', async () => {
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.findActiveById('cat-1');
      expect(result).not.toBeNull();
    });

    it('retorna null cuando no existe o está eliminada', async () => {
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findActiveById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('crea categoría exitosamente', async () => {
      (prisma.category.create as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.create({ name: 'Category 1', imageKey: 'key-1' });
      expect(result.id).toBe('cat-1');
    });
  });

  describe('update', () => {
    it('actualiza categoría exitosamente', async () => {
      (prisma.category.update as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.update('cat-1', 1, { name: 'Updated', imageKey: 'key-2' });
      expect(result).not.toBeNull();
    });

    it('retorna null cuando la versión no coincide', async () => {
      (prisma.category.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.update('cat-1', 999, { name: 'Updated', imageKey: 'key-2' });
      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('marca categoría como eliminada', async () => {
      (prisma.category.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.softDelete('cat-1');
      expect(result).toBe(true);
    });

    it('retorna false cuando la categoría no existe', async () => {
      (prisma.category.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.softDelete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('countActiveProducts', () => {
    it('retorna el número de productos activos', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(5);
      const result = await adapter.countActiveProducts('cat-1');
      expect(result).toBe(5);
    });
  });
});
