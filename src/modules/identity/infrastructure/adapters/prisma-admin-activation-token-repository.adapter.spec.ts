import { PrismaAdminActivationTokenRepositoryAdapter } from './prisma-admin-activation-token-repository.adapter';

function buildMockPrisma() {
  return {
    adminActivationToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe('PrismaAdminActivationTokenRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaAdminActivationTokenRepositoryAdapter;

  const mockToken = {
    id: 't1',
    userId: 'u1',
    tokenHash: 'hash1',
    expiresAt: new Date('2026-12-31'),
    usedAt: null,
    createdByUserId: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaAdminActivationTokenRepositoryAdapter(prisma as any);
  });

  describe('findByTokenHash', () => {
    it('retorna token por hash', async () => {
      (prisma.adminActivationToken.findUnique as jest.Mock).mockResolvedValue(mockToken);
      const result = await adapter.findByTokenHash('hash1');
      expect(result).not.toBeNull();
      expect(result?.tokenHash).toBe('hash1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.adminActivationToken.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findByTokenHash('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findActiveByUserId', () => {
    it('retorna token activo más reciente', async () => {
      (prisma.adminActivationToken.findFirst as jest.Mock).mockResolvedValue(mockToken);
      const result = await adapter.findActiveByUserId('u1', new Date());
      expect(result).not.toBeNull();
    });

    it('retorna null cuando no hay token activo', async () => {
      (prisma.adminActivationToken.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findActiveByUserId('u1', new Date());
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('crea token exitosamente', async () => {
      (prisma.adminActivationToken.create as jest.Mock).mockResolvedValue(mockToken);
      const result = await adapter.create({
        userId: 'u1',
        tokenHash: 'hash1',
        expiresAt: new Date('2026-12-31'),
        createdByUserId: 'admin-1',
      });
      expect(result.id).toBe('t1');
    });
  });

  describe('revokeExpiredUnused', () => {
    it('revoca tokens expirados no usados', async () => {
      (prisma.adminActivationToken.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      await adapter.revokeExpiredUnused('u1', new Date());
      expect(prisma.adminActivationToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('consumeUnused', () => {
    it('consume token no usado exitosamente', async () => {
      (prisma.adminActivationToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const result = await adapter.consumeUnused('t1', new Date());
      expect(result).toBe(true);
    });

    it('retorna false cuando el token ya fue consumido', async () => {
      (prisma.adminActivationToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      const result = await adapter.consumeUnused('t1', new Date());
      expect(result).toBe(false);
    });
  });
});
