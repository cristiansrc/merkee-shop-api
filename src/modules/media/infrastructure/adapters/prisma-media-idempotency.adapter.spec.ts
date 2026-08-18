import { PrismaMediaIdempotencyAdapter } from './prisma-media-idempotency.adapter';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';

function buildMockPrisma() {
  return {
    idempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
}

describe('PrismaMediaIdempotencyAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaMediaIdempotencyAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaMediaIdempotencyAdapter(prisma);
  });

  describe('find', () => {
    it('retorna registro por scope y key', async () => {
      (prisma.idempotencyRecord.findUnique as jest.Mock).mockResolvedValue({
        scope: 'media-upload:u1',
        idempotencyKey: 'key-1',
        bodyHash: 'hash1',
        responseJson: { url: 'https://s3.example.com/upload' },
      });
      const result = await adapter.find('media-upload:u1', 'key-1');
      expect(result).not.toBeNull();
      expect(result?.scope).toBe('media-upload:u1');
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
          scope: 'media-upload:u1',
          idempotency_key: 'key-1',
          body_hash: 'hash1',
          response_json: { url: 'https://s3.example.com/upload' },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const result = await adapter.findForUpdate('media-upload:u1', 'key-1');
      expect(result).not.toBeNull();
      expect(result?.key).toBe('key-1');
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
      await adapter.save('media-upload:u1', 'key-1', 'hash1', { url: 'https://s3.example.com/upload' });
      expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith({
        data: {
          scope: 'media-upload:u1',
          idempotencyKey: 'key-1',
          bodyHash: 'hash1',
          responseJson: { url: 'https://s3.example.com/upload' },
        },
      });
    });
  });
});
