/**
 * Integration test for identity module against real PostgreSQL.
 *
 * Verifies: register, login, refresh, logout, password-change flows
 * with real Prisma/PostgreSQL (no mocks).
 *
 * Run: npm run test:integration
 */
import { PrismaClient } from '@prisma/client';
import { cleanupTestDatabase, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME, CLIENT_EMAIL, CLIENT_PASSWORD, CLIENT_DISPLAY_NAME, sha256 } from './fixtures';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/merkee_shop?schema=public',
    },
  },
});

describe('Identity Integration (PostgreSQL)', () => {
  beforeAll(async () => {
    await cleanupTestDatabase(prisma);
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
    await prisma.$disconnect();
  });

  describe('User repository operations', () => {
    it('creates a client user with correct fields', async () => {
      const user = await prisma.user.create({
        data: {
          email: CLIENT_EMAIL,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
          displayName: CLIENT_DISPLAY_NAME,
          role: 'cliente',
        },
      });

      expect(user).toBeDefined();
      expect(user.email).toBe(CLIENT_EMAIL);
      expect(user.role).toBe('cliente');
      expect(user.mustChangePassword).toBe(true); // Default is true per migration 001
    });

    it('enforces unique email constraint', async () => {
      await expect(
        prisma.user.create({
          data: {
            email: CLIENT_EMAIL,
            passwordHash: '$argon2id$placeholder',
            displayName: 'Duplicate',
            role: 'cliente',
          },
        }),
      ).rejects.toThrow();
    });

    it('finds user by email case-insensitive (raw SQL)', async () => {
      const users = await prisma.$queryRaw<{ email: string }[]>`
        SELECT email FROM users WHERE lower(email) = lower(${CLIENT_EMAIL.toUpperCase()})
      `;
      expect(users.length).toBe(1);
      expect(users[0].email).toBe(CLIENT_EMAIL);
    });
  });

  describe('Session management', () => {
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirst({ where: { email: CLIENT_EMAIL } });
      userId = user!.id;
    });

    it('creates an AUTHENTICATED session', async () => {
      const now = new Date();
      const session = await prisma.session.create({
        data: {
          userId,
          sessionKind: 'AUTHENTICATED',
          refreshTokenHash: sha256('test-refresh-token'),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          lastActivityAt: now,
        },
      });

      expect(session).toBeDefined();
      expect(session.sessionKind).toBe('AUTHENTICATED');
      expect(session.revokedAt).toBeNull();
    });

    it('finds session by refresh token hash', async () => {
      const hash = sha256('test-refresh-token');
      const session = await prisma.session.findUnique({
        where: { refreshTokenHash: hash },
      });
      expect(session).not.toBeNull();
    });

    it('revokes a session', async () => {
      const sessions = await prisma.session.findMany({
        where: { userId, revokedAt: null },
      });
      expect(sessions.length).toBeGreaterThan(0);

      await prisma.session.update({
        where: { id: sessions[0].id },
        data: { revokedAt: new Date() },
      });

      const revoked = await prisma.session.findUnique({
        where: { id: sessions[0].id },
      });
      expect(revoked!.revokedAt).not.toBeNull();
    });
  });

  describe('Password reset tokens', () => {
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirst({ where: { email: CLIENT_EMAIL } });
      userId = user!.id;
    });

    it('creates a password reset token', async () => {
      const token = await prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: sha256('reset-token-1'),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      expect(token).toBeDefined();
      expect(token.usedAt).toBeNull();
    });

    it('enforces unique active token per user (migration 014)', async () => {
      // Attempting to create a second active token should fail
      await expect(
        prisma.passwordResetToken.create({
          data: {
            userId,
            tokenHash: sha256('reset-token-2'),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        }),
      ).rejects.toThrow();
    });

    it('allows second token after first is used', async () => {
      // Mark first token as used
      await prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Now creating a new active token should succeed
      const token = await prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: sha256('reset-token-3'),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      expect(token).toBeDefined();
      expect(token.usedAt).toBeNull();
    });
  });

  describe('Admin activation tokens', () => {
    let adminUserId: string;

    beforeAll(async () => {
      const admin = await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
          displayName: ADMIN_DISPLAY_NAME,
          role: 'admin',
          mustChangePassword: true,
        },
      });
      adminUserId = admin.id;
    });

    it('creates an activation token for admin', async () => {
      const token = await prisma.adminActivationToken.create({
        data: {
          userId: adminUserId,
          tokenHash: sha256('activation-token-1'),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdByUserId: adminUserId,
        },
      });

      expect(token).toBeDefined();
      expect(token.usedAt).toBeNull();
    });

    it('enforces unique active token per admin', async () => {
      await expect(
        prisma.adminActivationToken.create({
          data: {
            userId: adminUserId,
            tokenHash: sha256('activation-token-2'),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdByUserId: adminUserId,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
