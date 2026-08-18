import { PrismaPasswordResetTokenRepositoryAdapter } from './prisma-password-reset-token-repository.adapter';

function buildMockPrisma() {
  return {
    passwordResetToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe('PrismaPasswordResetTokenRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaPasswordResetTokenRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaPasswordResetTokenRepositoryAdapter(prisma as any);
  });

  describe('invalidateAllActiveForUser', () => {
    it('invalida tokens activos del usuario', async () => {
      (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      await adapter.invalidateAllActiveForUser('u1');
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('create', () => {
    it('crea token de reset exitosamente', async () => {
      (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
      await adapter.create('u1', 'hash1', new Date('2026-12-31'));
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: { userId: 'u1', tokenHash: 'hash1', expiresAt: new Date('2026-12-31') },
      });
    });
  });

  describe('findByTokenHash', () => {
    it('retorna token por hash', async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
        id: 't1',
        userId: 'u1',
        expiresAt: new Date('2026-12-31'),
        usedAt: null,
      });
      const result = await adapter.findByTokenHash('hash1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('t1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findByTokenHash('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('markAsUsed', () => {
    it('marca token como usado exitosamente', async () => {
      (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const result = await adapter.markAsUsed('t1', new Date());
      expect(result).toBe(true);
    });

    it('retorna false cuando el token ya fue usado', async () => {
      (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      const result = await adapter.markAsUsed('t1', new Date());
      expect(result).toBe(false);
    });
  });
});
