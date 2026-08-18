import { PrismaBannerRepositoryAdapter } from './prisma-banner-repository.adapter';

function buildMockPrisma() {
  return {
    banner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'b1',
    name: 'Banner 1',
    imageKey: 'key-1',
    targetPath: '/products',
    displayOrder: 1,
    active: true,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('PrismaBannerRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaBannerRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaBannerRepositoryAdapter(prisma as any);
  });

  describe('listActive', () => {
    it('retorna banners activos', async () => {
      (prisma.banner.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      const result = await adapter.listActive();
      expect(result).toHaveLength(1);
    });
  });

  describe('listAll', () => {
    it('retorna todos los banners', async () => {
      (prisma.banner.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      const result = await adapter.listAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('retorna banner por id', async () => {
      (prisma.banner.findUnique as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.findById('b1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('b1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.banner.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('crea banner exitosamente', async () => {
      (prisma.banner.create as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.create({
        name: 'Banner 1',
        imageKey: 'key-1',
        targetPath: '/products',
        displayOrder: 1,
        active: true,
      });
      expect(result.id).toBe('b1');
    });
  });

  describe('update', () => {
    it('actualiza banner exitosamente', async () => {
      (prisma.banner.update as jest.Mock).mockResolvedValue(makeRow());
      const result = await adapter.update('b1', 1, {
        name: 'Updated',
        imageKey: 'key-2',
        targetPath: '/updated',
        displayOrder: 2,
        active: false,
      });
      expect(result).not.toBeNull();
    });

    it('retorna null cuando la versión no coincide', async () => {
      (prisma.banner.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.update('b1', 999, {
        name: 'Updated',
        imageKey: 'key-2',
        targetPath: null,
        displayOrder: 2,
        active: false,
      });
      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('marca banner como eliminado', async () => {
      (prisma.banner.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.softDelete('b1');
      expect(result).toBe(true);
    });

    it('retorna false cuando el banner no existe', async () => {
      (prisma.banner.update as jest.Mock).mockRejectedValue(new Error('Record not found'));
      const result = await adapter.softDelete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
