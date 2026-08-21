import { LoginUseCase } from './login.use-case';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import { User } from '../../domain/models/user';
import { Session } from '../../domain/models/session';
import { isSuccess, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode, DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

function stubUserRepo(overrides?: Partial<UserRepositoryPort>): UserRepositoryPort {
  return {
    findByEmail: jest.fn().mockResolvedValue(ok(null)),
    findById: jest.fn().mockResolvedValue(ok(null)),
    create: jest.fn().mockResolvedValue(ok({} as User)),
    updateProfile: jest.fn().mockResolvedValue(ok({} as User)),
    createAdmin: jest.fn().mockResolvedValue(ok({} as User)),
    updatePassword: jest.fn().mockResolvedValue(ok({} as User)),
    ...overrides,
  };
}

function stubSessionRepo(overrides?: Partial<SessionRepositoryPort>): SessionRepositoryPort {
  return {
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve(ok(
{

        id: 'session-auth-1',
        userId: data.userId,
        sessionKind: data.sessionKind,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      } satisfies Session)),
    ),
    findById: jest.fn().mockResolvedValue(ok(null)),
    findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(null)),
    rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined)),
    revoke: jest.fn().mockResolvedValue(ok(undefined)),
    revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined)),
    revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined)),
    findActiveByUserId: jest.fn().mockResolvedValue(ok(null)),
    findActiveByUserIdExcluding: jest.fn().mockResolvedValue(ok([])),
    touchActivity: jest.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  };
}

function stubPasswordHasher(overrides?: Partial<PasswordHasherPort>): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue(ok('hashed')),
    verify: jest.fn().mockResolvedValue(ok(true)),
    ...overrides,
  };
}

function stubJwt(overrides?: Partial<JwtPort>): JwtPort {
  return {
    sign: jest.fn().mockResolvedValue(ok('jwt-token')),
    verify: jest.fn().mockResolvedValue({ sub: 'user-1', session_id: 'session-1', role: 'cliente' }),
    ...overrides,
  };
}

function stubCookieToken(overrides?: Partial<CookieTokenPort>): CookieTokenPort {
  return {
    generate: jest.fn().mockReturnValue('raw-refresh-token'),
    hash: jest.fn().mockReturnValue('hashed-refresh-token'),
    ...overrides,
  };
}

function stubClock(overrides?: Partial<ClockPort>): ClockPort {
  return {
    now: jest.fn().mockReturnValue(fixedDate),
    ...overrides,
  };
}

function stubCartReservation(overrides?: Partial<CartReservationPort>): CartReservationPort {
  return {
    releaseActiveReservations: jest.fn().mockResolvedValue(ok(undefined)),
    closeCart: jest.fn().mockResolvedValue(ok(undefined)),
    transferGuestCart: jest.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  };
}

const existingUser: User = {
  id: 'user-1',
  email: 'cliente@example.com',
  passwordHash: 'stored-hash',
  displayName: 'Cliente Uno',
  phone: null,
  role: 'cliente',
  mustChangePassword: false,
  createdAt: fixedDate,
  updatedAt: fixedDate,
};

const existingAdmin: User = {
  ...existingUser,
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  mustChangePassword: true,
};

function createUseCase(overrides?: {
  userRepo?: Partial<UserRepositoryPort>;
  sessionRepo?: Partial<SessionRepositoryPort>;
  passwordHasher?: Partial<PasswordHasherPort>;
  jwt?: Partial<JwtPort>;
  cookieToken?: Partial<CookieTokenPort>;
  clock?: Partial<ClockPort>;
  cartReservation?: Partial<CartReservationPort>;
}): LoginUseCase {
  return new LoginUseCase(
    stubUserRepo(overrides?.userRepo),
    stubSessionRepo(overrides?.sessionRepo),
    stubPasswordHasher(overrides?.passwordHasher),
    stubJwt(overrides?.jwt),
    stubCookieToken(overrides?.cookieToken),
    stubClock(overrides?.clock),
    stubCartReservation(overrides?.cartReservation),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginUseCase', () => {
  const command = {
    email: 'cliente@example.com',
    password: 'correctPassword',
  };

  describe('Success', () => {
    it('autentica un cliente y devuelve SessionDto + refreshToken', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
      });
      const result = await uc.execute(command);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value.session.access_token).toBe('jwt-token');
        expect(result.value.session.user.role).toBe('cliente');
        expect(result.value.session.user.email).toBe('cliente@example.com');
        expect(result.value.refreshToken).toBe('raw-refresh-token');
      }
    });

    it('autentica un admin y devuelve SessionDto con role admin', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingAdmin)) },
      });
      const result = await uc.execute({ email: 'admin@example.com', password: 'pw' });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value.session.user.role).toBe('admin');
        expect(result.value.session.user.must_change_password).toBe(true);
      }
    });
  });

  describe('Credenciales inválidas neutras', () => {
    it('devuelve INVALID_CREDENTIALS si el email no existe', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(null)) },
      });
      const result = await uc.execute(command);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.INVALID_CREDENTIALS);
      }
    });

    it('devuelve INVALID_CREDENTIALS si la contraseña es incorrecta', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        passwordHasher: { verify: jest.fn().mockResolvedValue(ok(false)) },
      });
      const result = await uc.execute(command);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.INVALID_CREDENTIALS);
      }
    });

    it('el mensaje de error es idéntico para email inexistente y contraseña incorrecta', async () => {
      const uc1 = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(null)) },
      });
      const uc2 = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        passwordHasher: { verify: jest.fn().mockResolvedValue(ok(false)) },
      });

      const r1 = await uc1.execute(command);
      const r2 = await uc2.execute(command);

      if (isFailure(r1) && isFailure(r2)) {
        expect(r1.error.code).toBe(r2.error.code);
        expect(r1.error.messageKey).toBe(r2.error.messageKey);
      }
    });
  });

  describe('Promoción guest→cliente', () => {
    it('transfiere el carrito guest a la nueva sesión y revoca la guest', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const findById = jest.fn().mockResolvedValue(ok(guestSession));
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));
      const transferGuestCart = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        sessionRepo: { findById, revoke },
        cartReservation: { transferGuestCart },
      });

      const result = await uc.execute({ ...command, guestSessionId: 'guest-session-1' });

      expect(isSuccess(result)).toBe(true);
      expect(findById).toHaveBeenCalledWith('guest-session-1');
      expect(transferGuestCart).toHaveBeenCalledWith('guest-session-1', 'session-auth-1');
      expect(revoke).toHaveBeenCalledWith('guest-session-1');
    });

    it('no libera reservas ni cierra carrito para guest→cliente', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const releaseActive = jest.fn().mockResolvedValue(ok(undefined as never));
      const closeCart = jest.fn().mockResolvedValue(ok(undefined as never));
      const transferGuestCart = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        sessionRepo: { findById: jest.fn().mockResolvedValue(ok(guestSession)) },
        cartReservation: { releaseActiveReservations: releaseActive, closeCart, transferGuestCart },
      });

      await uc.execute({ ...command, guestSessionId: 'guest-session-1' });

      expect(releaseActive).not.toHaveBeenCalled();
      expect(closeCart).not.toHaveBeenCalled();
      expect(transferGuestCart).toHaveBeenCalledWith('guest-session-1', 'session-auth-1');
    });
  });

  describe('Promoción guest→admin', () => {
    it('libera reservas ACTIVE, cierra carrito y revoca guest', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const releaseActive = jest.fn().mockResolvedValue(ok(undefined as never));
      const closeCart = jest.fn().mockResolvedValue(ok(undefined as never));
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingAdmin)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(guestSession)),
          revoke,
        },
        cartReservation: { releaseActiveReservations: releaseActive, closeCart },
      });

      const result = await uc.execute(
{

        email: 'admin@example.com',
        password: 'pw',
        guestSessionId: 'guest-session-1',
      });

      expect(isSuccess(result)).toBe(true);
      expect(releaseActive).toHaveBeenCalledWith('guest-session-1');
      expect(closeCart).toHaveBeenCalledWith('guest-session-1');
      expect(revoke).toHaveBeenCalledWith('guest-session-1');
    });

    it('no crea carrito para admin', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const sessionCreate = jest.fn().mockImplementation((data) =>
        Promise.resolve(ok(
{

          id: 'session-admin-1',
          userId: data.userId,
          sessionKind: data.sessionKind,
          refreshTokenHash: data.refreshTokenHash,
          expiresAt: data.expiresAt,
          lastActivityAt: fixedDate,
          revokedAt: null,
          createdAt: fixedDate,
        } satisfies Session)),
      );

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingAdmin)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(guestSession)),
          create: sessionCreate,
        },
      });

      await uc.execute(
{

        email: 'admin@example.com',
        password: 'pw',
        guestSessionId: 'guest-session-1',
      });

      // La sesión admin se crea sin carrito (el carrito es responsabilidad de cart-reservation)
      expect(sessionCreate).toHaveBeenCalledWith(
        expect.objectContaining(
{

          userId: 'admin-1',
          sessionKind: 'AUTHENTICATED',
        }),
      );
    });
  });

  describe('Error técnico', () => {
    it('devuelve TECHNICAL_DEPENDENCY_FAILURE ante error inesperado', async () => {
      const uc = createUseCase(
{

        userRepo: {
          findByEmail: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });
      const result = await uc.execute(command);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
    });

    it('propaga error de passwordHasher.verify', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        passwordHasher: { verify: jest.fn().mockResolvedValue(fail(technicalFailure())) },
      });
      const result = await uc.execute(command);
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de sessionRepo.findById durante guest promotion', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ ...command, guestSessionId: 'guest-session-1' });
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de sessionRepo.revoke durante guest→admin', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingAdmin)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(guestSession)),
          revoke: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
        cartReservation: {
          releaseActiveReservations: jest.fn().mockResolvedValue(ok(undefined as never)),
          closeCart: jest.fn().mockResolvedValue(ok(undefined as never)),
        },
      });

      const result = await uc.execute({
        email: 'admin@example.com',
        password: 'pw',
        guestSessionId: 'guest-session-1',
      });
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de sessionRepo.create', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        sessionRepo: {
          create: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute(command);
      expect(isFailure(result)).toBe(true);
    });

    it('propaga error de jwt.sign', async () => {
      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        jwt: { sign: jest.fn().mockResolvedValue(fail(technicalFailure())) },
      });

      const result = await uc.execute(command);
      expect(isFailure(result)).toBe(true);
    });

    it('revoca guest session después de guest→admin con éxito', async () => {
      const guestSession: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: null,
        createdAt: fixedDate,
      };
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingAdmin)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(guestSession)),
          revoke,
        },
        cartReservation: {
          releaseActiveReservations: jest.fn().mockResolvedValue(ok(undefined as never)),
          closeCart: jest.fn().mockResolvedValue(ok(undefined as never)),
        },
      });

      await uc.execute({
        email: 'admin@example.com',
        password: 'pw',
        guestSessionId: 'guest-session-1',
      });
      expect(revoke).toHaveBeenCalledWith('guest-session-1');
    });

    it('no revoca guest si session revocada', async () => {
      const revokedGuest: Session = {
        id: 'guest-session-1',
        userId: null,
        sessionKind: 'GUEST',
        refreshTokenHash: 'guest-hash',
        expiresAt: new Date(fixedDate.getTime() + 60000),
        lastActivityAt: fixedDate,
        revokedAt: fixedDate,
        createdAt: fixedDate,
      };
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));
      const releaseActive = jest.fn();

      const uc = createUseCase(
{

        userRepo: { findByEmail: jest.fn().mockResolvedValue(ok(existingUser)) },
        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(revokedGuest)),
          revoke,
        },
        cartReservation: { releaseActiveReservations: releaseActive },
      });

      const result = await uc.execute({ ...command, guestSessionId: 'guest-session-1' });
      expect(isSuccess(result)).toBe(true);
      expect(revoke).not.toHaveBeenCalled();
      expect(releaseActive).not.toHaveBeenCalled();
    });
  });
});
