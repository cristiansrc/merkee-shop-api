import { PrismaIdempotencyAdapter } from './prisma-idempotency.adapter';
import { PrismaService } from '../prisma.service';

function buildMockPrisma() {
  return {
    idempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
}

describe('PrismaIdempotencyAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaIdempotencyAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaIdempotencyAdapter(prisma);
  });

  describe('find', () => {
    it('retorna registro por scope y key', async () => {
      (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValue({
        scope: 'admin-provision:u1',
        idempotencyKey: 'key-1',
        bodyHash: 'hash1',
        responseJson: { status: 201 },
      });
      const result = await adapter.find('admin-provision:u1', 'key-1');
      expect(result).not.toBeNull();
      expect(result?.scope).toBe('admin-provision:u1');
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
          id: 'r1',
          scope: 'scope',
          idempotency_key: 'key',
          body_hash: 'hash',
          response_json: { status: 204 },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const result = await adapter.findForUpdate('scope', 'key');
      expect(result).not.toBeNull();
      expect(result?.key).toBe('key');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await adapter.findForUpdate('scope', 'key');
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('guarda registro de idempotencia', async () => {
      (prisma.idempotencyRecord.create as jest.Mock).mockResolvedValue({});
      await adapter.save('scope', 'key', 'hash', { status: 204 });
      expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith({
        data: {
          scope: 'scope',
          idempotencyKey: 'key',
          bodyHash: 'hash',
          responseJson: { status: 204 },
        },
      });
    });
  });
});
