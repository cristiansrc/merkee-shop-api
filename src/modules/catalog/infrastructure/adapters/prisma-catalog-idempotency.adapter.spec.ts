import { PrismaCatalogIdempotencyAdapter } from './prisma-catalog-idempotency.adapter';

function buildMockPrisma() {
  return {
    idempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
}

describe('PrismaCatalogIdempotencyAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaCatalogIdempotencyAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaCatalogIdempotencyAdapter(prisma as any);
  });

  describe('find', () => {
    it('retorna registro por scope y key', async () => {
      (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValue({
        scope: 'catalog:u1',
        idempotencyKey: 'key-1',
        bodyHash: 'hash1',
        responseJson: { status: 201 },
      });
      const result = await adapter.find('catalog:u1', 'key-1');
      expect(result).not.toBeNull();
      expect(result?.scope).toBe('catalog:u1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.find('scope', 'key');
      expect(result).toBeNull();
    });
  });

  describe('findForUpdate', () => {
    it('retorna registro con FOR UPDATE', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          scope: 'catalog:u1',
          idempotency_key: 'key-1',
          body_hash: 'hash1',
          response_json: { status: 201 },
        },
      ]);
      const result = await adapter.findForUpdate('catalog:u1', 'key-1');
      expect(result).not.toBeNull();
      expect(result?.idempotencyKey).toBe('key-1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await adapter.findForUpdate('scope', 'key');
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('guarda registro exitosamente', async () => {
      (prisma.idempotencyRecord.create as jest.Mock).mockResolvedValue({});
      await adapter.save({
        scope: 'catalog:u1',
        idempotencyKey: 'key-1',
        bodyHash: 'hash1',
        responseJson: { status: 201 },
      });
      expect(prisma.idempotencyRecord.create).toHaveBeenCalled();
    });
  });
});
