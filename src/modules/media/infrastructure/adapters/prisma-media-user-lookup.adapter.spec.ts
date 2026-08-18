import { PrismaMediaUserLookupAdapter } from './prisma-media-user-lookup.adapter';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';

function buildMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('PrismaMediaUserLookupAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaMediaUserLookupAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaMediaUserLookupAdapter(prisma);
  });

  describe('findById', () => {
    it('retorna información del usuario', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        role: 'admin',
        mustChangePassword: false,
      });
      const result = await adapter.findById('u1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('u1');
      expect(result?.role).toBe('admin');
    });

    it('retorna null cuando el usuario no existe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
