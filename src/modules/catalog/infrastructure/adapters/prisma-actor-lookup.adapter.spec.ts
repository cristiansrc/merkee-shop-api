import { PrismaActorLookupAdapter } from './prisma-actor-lookup.adapter';

function buildMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
  };
}

describe('PrismaActorLookupAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaActorLookupAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaActorLookupAdapter(prisma as any);
  });

  describe('findById', () => {
    it('retorna información del actor', async () => {
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
