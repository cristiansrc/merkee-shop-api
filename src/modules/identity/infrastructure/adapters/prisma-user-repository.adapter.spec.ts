import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';

function buildMockPrisma() {
  return {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('PrismaUserRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaUserRepositoryAdapter;

  const selectFields = {
    id: true,
    email: true,
    passwordHash: true,
    displayName: true,
    phone: true,
    role: true,
    mustChangePassword: true,
    createdAt: true,
    updatedAt: true,
  };

  const mockPrismaUser = {
    id: 'u1',
    email: 'test@example.com',
    passwordHash: 'hash',
    displayName: 'Test',
    phone: null,
    role: 'cliente',
    mustChangePassword: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaUserRepositoryAdapter(prisma as any);
  });

  describe('findByEmail', () => {
    it('retorna usuario por email', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.findByEmail('Test@Example.com');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.email).toBe('test@example.com');
      }
    });

    it('retorna null cuando no existe', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findByEmail('noexiste@example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('retorna error técnico cuando Prisma falla', async () => {
      (prisma.user.findFirst as jest.Mock).mockRejectedValue(new Error('DB fail'));
      const result = await adapter.findByEmail('test@example.com');
      expect(result.ok).toBe(false);
    });
  });

  describe('findById', () => {
    it('retorna usuario por id', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.findById('u1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe('u1');
      }
    });

    it('retorna null cuando no existe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findById('nonexistent');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('retorna error técnico', async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.findById('u1');
      expect(result.ok).toBe(false);
    });
  });

  describe('create', () => {
    it('crea usuario exitosamente', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.create({
        email: 'Test@Example.com',
        passwordHash: 'hash',
        displayName: 'Test',
        phone: null,
        role: 'cliente',
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.id).toBe('u1');
    });

    it('derive mustChangePassword=false para cliente', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockPrismaUser);
      await adapter.create({
        email: 'test@example.com',
        passwordHash: 'hash',
        displayName: 'Test',
        phone: null,
        role: 'cliente',
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mustChangePassword: false,
          }),
        }),
      );
    });

    it('derive mustChangePassword=true para admin', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({
        ...mockPrismaUser,
        role: 'admin',
        mustChangePassword: true,
      });
      await adapter.create({
        email: 'admin@example.com',
        passwordHash: 'hash',
        displayName: 'Admin',
        phone: null,
        role: 'admin',
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mustChangePassword: true,
          }),
        }),
      );
    });

    it('usa email.split cuando displayName está vacío', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.create({
        email: 'test@example.com',
        passwordHash: 'hash',
        displayName: '',
        phone: null,
        role: 'cliente',
      });
      expect(result.ok).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'test',
          }),
        }),
      );
    });

    it('retorna error técnico cuando create falla', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('DB fail'));
      const result = await adapter.create({
        email: 'test@example.com',
        passwordHash: 'hash',
        displayName: 'Test',
        phone: null,
        role: 'cliente',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('createAdmin', () => {
    it('crea admin exitosamente', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({
        ...mockPrismaUser,
        role: 'admin',
        mustChangePassword: true,
      });
      const result = await adapter.createAdmin({
        email: 'admin@example.com',
        displayName: 'Admin',
        phone: null,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.role).toBe('admin');
    });

    it('usa email.split cuando displayName está vacío', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.createAdmin({
        email: 'admin@example.com',
        displayName: '  ',
        phone: null,
      });
      expect(result.ok).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'admin',
          }),
        }),
      );
    });

    it('retorna error técnico cuando create falla', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('DB fail'));
      const result = await adapter.createAdmin({
        email: 'admin@example.com',
        displayName: 'Admin',
        phone: null,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('actualiza password exitosamente', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.updatePassword('u1', 'newhash');
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico cuando update falla', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.updatePassword('u1', 'newhash');
      expect(result.ok).toBe(false);
    });
  });

  describe('updateProfile', () => {
    it('actualiza perfil exitosamente', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(mockPrismaUser);
      const result = await adapter.updateProfile('u1', {
        displayName: 'New Name',
        phone: '+57300',
      });
      expect(result.ok).toBe(true);
    });

    it('retorna error técnico cuando update falla', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await adapter.updateProfile('u1', {
        displayName: 'New Name',
        phone: null,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('mapToUser', () => {
    it('mapea phone null correctamente', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockPrismaUser,
        phone: null,
      });
      const result = await adapter.findById('u1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.phone).toBeNull();
      }
    });

    it('mapea phone con valor correctamente', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockPrismaUser,
        phone: '+57300',
      });
      const result = await adapter.findById('u1');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.phone).toBe('+57300');
      }
    });
  });
});
