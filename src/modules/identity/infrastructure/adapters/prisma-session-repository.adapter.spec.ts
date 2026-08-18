import { PrismaSessionRepositoryAdapter } from './prisma-session-repository.adapter';
import { PrismaService } from '../prisma.service';

function buildMockPrisma() {
  return {
    session: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('PrismaSessionRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaSessionRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaSessionRepositoryAdapter(prisma as any);
  });

  describe('findByUserId', () => {
    it('retorna sesiones del usuario', async () => {
      (prisma.session.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date() },
      ]);
      const result = await adapter.findByUserId('u1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(1);
    });

    it('retorna error técnico cuando Prisma falla', async () => {
      (prisma.session.findMany as jest.Mock).mockRejectedValue(new Error('DB fail'));
      const result = await adapter.findByUserId('u1');
      expect(result.ok).toBe(false);
    });
  });

  describe('create', () => {
    it('crea una sesión exitosamente', async () => {
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.create({
        userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.id).toBe('s1');
    });

    it('retorna error técnico cuando create falla', async () => {
      (prisma.session.create as jest.Mock).mockRejectedValue(new Error('DB fail'));
      const result = await adapter.create({
        userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(),
      });
      expect(result.ok).toBe(false);
    });

    it('crea sesión GUEST cuando sessionKind es GUEST', async () => {
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: 's1', userId: null, sessionKind: 'GUEST', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.create({
        userId: null, sessionKind: 'GUEST', refreshTokenHash: 'h', expiresAt: new Date(),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('findById', () => {
    it('retorna sesión por id', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.findById('s1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value?.id).toBe('s1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('retorna error técnico', async () => {
      (prisma.session.findUnique as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.findById('s1');
      expect(result.ok).toBe(false);
    });
  });

  describe('findByRefreshTokenHash', () => {
    it('retorna sesión por hash del token', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'hash', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.findByRefreshTokenHash('hash');
      expect(result.ok).toBe(true);
    });

    it('retorna null cuando no existe', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findByRefreshTokenHash('hash');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('retorna error técnico', async () => {
      (prisma.session.findUnique as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.findByRefreshTokenHash('hash');
      expect(result.ok).toBe(false);
    });
  });

  describe('findActiveByUserId', () => {
    it('retorna sesión activa más reciente', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.findActiveByUserId('u1', new Date());
      expect(result.ok).toBe(true);
    });

    it('retorna null cuando no hay sesión activa', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findActiveByUserId('u1', new Date());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('retorna error técnico', async () => {
      (prisma.session.findFirst as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.findActiveByUserId('u1', new Date());
      expect(result.ok).toBe(false);
    });
  });

  describe('findActiveByUserIdExcluding', () => {
    it('retorna sesiones excluyendo la especificada', async () => {
      (prisma.session.findMany as jest.Mock).mockResolvedValue([
        { id: 's2', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date() },
      ]);
      const result = await adapter.findActiveByUserIdExcluding('u1', 's1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(1);
    });

    it('retorna error técnico', async () => {
      (prisma.session.findMany as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.findActiveByUserIdExcluding('u1', 's1');
      expect(result.ok).toBe(false);
    });
  });

  describe('rotateRefreshToken', () => {
    it('rota el refresh token exitosamente', async () => {
      (prisma.session.update as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'new-hash', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.rotateRefreshToken('s1', 'new-hash', new Date());
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico', async () => {
      (prisma.session.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.rotateRefreshToken('s1', 'new-hash', new Date());
      expect(result.ok).toBe(false);
    });
  });

  describe('touchActivity', () => {
    it('actualiza lastActivityAt exitosamente', async () => {
      (prisma.session.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.touchActivity('s1', new Date());
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico', async () => {
      (prisma.session.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.touchActivity('s1', new Date());
      expect(result.ok).toBe(false);
    });
  });

  describe('revoke', () => {
    it('revoca la sesión exitosamente', async () => {
      (prisma.session.update as jest.Mock).mockResolvedValue({});
      const result = await adapter.revoke('s1');
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico', async () => {
      (prisma.session.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.revoke('s1');
      expect(result.ok).toBe(false);
    });
  });

  describe('revokeAllForUser', () => {
    it('revoca todas las sesiones del usuario', async () => {
      (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      const result = await adapter.revokeAllForUser('u1');
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico', async () => {
      (prisma.session.updateMany as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.revokeAllForUser('u1');
      expect(result.ok).toBe(false);
    });
  });

  describe('revokeAllForUserExcept', () => {
    it('revoca todas las sesiones excepto la especificada', async () => {
      (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      const result = await adapter.revokeAllForUserExcept('u1', 's1');
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico', async () => {
      (prisma.session.updateMany as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.revokeAllForUserExcept('u1', 's1');
      expect(result.ok).toBe(false);
    });
  });

  describe('toDomain', () => {
    it('mapea sesión AUTHENTICATED correctamente', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.findById('s1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.sessionKind).toBe('AUTHENTICATED');
        expect(result.value.userId).toBe('u1');
      }
    });

    it('mapea sesión GUEST correctamente', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', userId: null, sessionKind: 'GUEST', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt: null, createdAt: new Date(),
      });
      const result = await adapter.findById('s1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.sessionKind).toBe('GUEST');
        expect(result.value.userId).toBeNull();
      }
    });

    it('mapea sesión con revokedAt correctamente', async () => {
      const revokedAt = new Date();
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 's1', userId: 'u1', sessionKind: 'AUTHENTICATED', refreshTokenHash: 'h', expiresAt: new Date(), lastActivityAt: new Date(), revokedAt, createdAt: new Date(),
      });
      const result = await adapter.findById('s1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.revokedAt).toBe(revokedAt);
      }
    });
  });
});
