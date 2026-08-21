import { LogoutUseCase } from './logout.use-case';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import { Session } from '../../domain/models/session';
import { isSuccess, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode, DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-08-15T12:00:00.000Z');

function stubSessionRepo(overrides?: Partial<SessionRepositoryPort>): SessionRepositoryPort {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(ok(null)),
    findByRefreshTokenHash: jest.fn().mockResolvedValue(ok(null)),
    rotateRefreshToken: jest.fn().mockResolvedValue(ok(undefined as never)),
    revoke: jest.fn().mockResolvedValue(ok(undefined as never)),
    revokeAllForUser: jest.fn().mockResolvedValue(ok(undefined as never)),
    revokeAllForUserExcept: jest.fn().mockResolvedValue(ok(undefined as never)),
    findActiveByUserId: jest.fn().mockResolvedValue(ok(null)),
    findActiveByUserIdExcluding: jest.fn().mockResolvedValue(ok([])),
    touchActivity: jest.fn().mockResolvedValue(ok(undefined as never)),
    ...overrides,
  };
}

function stubCartReservation(overrides?: Partial<CartReservationPort>): CartReservationPort {
  return {
    releaseActiveReservations: jest.fn().mockResolvedValue(ok(undefined as never)),
    closeCart: jest.fn().mockResolvedValue(ok(undefined as never)),
    transferGuestCart: jest.fn().mockResolvedValue(ok(undefined as never)),
    ...overrides,
  };
}

const activeSession: Session = {
  id: 'session-1',
  userId: 'user-1',
  sessionKind: 'AUTHENTICATED',
  refreshTokenHash: 'hashed-token',
  expiresAt: new Date(fixedDate.getTime() + 60000),
  lastActivityAt: fixedDate,
  revokedAt: null,
  createdAt: fixedDate,
};

function createUseCase(overrides?: {
  sessionRepo?: Partial<SessionRepositoryPort>;
  cartReservation?: Partial<CartReservationPort>;
}): LogoutUseCase {
  return new LogoutUseCase(
    stubSessionRepo(overrides?.sessionRepo),
    stubCartReservation(overrides?.cartReservation),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LogoutUseCase', () => {
  describe('Success', () => {
    it('revoca la sesión y libera reservas ACTIVE', async () => {
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));
      const releaseActive = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(activeSession)),
          revoke,
        },
        cartReservation: { releaseActiveReservations: releaseActive },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isSuccess(result)).toBe(true);
      expect(releaseActive).toHaveBeenCalledWith('session-1');
      expect(revoke).toHaveBeenCalledWith('session-1');
    });

    it('devuelve void en éxito', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(activeSession)),
        },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value).toBeUndefined();
      }
    });
  });

  describe('Idempotencia', () => {
    it('tiene éxito si la sesión ya está revocada (idempotente)', async () => {
      const revokedSession: Session = { ...activeSession, revokedAt: fixedDate };
      const revoke = jest.fn().mockResolvedValue(ok(undefined as never));
      const releaseActive = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(revokedSession)),
          revoke,
        },
        cartReservation: { releaseActiveReservations: releaseActive },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isSuccess(result)).toBe(true);
      // No debe llamar a releaseActive ni revoke si ya está revocada
      expect(releaseActive).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });
  });

  describe('Failure', () => {
    it('falla si la sesión no existe', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(null)),
        },
      });

      const result = await uc.execute({ sessionId: 'nonexistent' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      }
    });
  });

  describe('No toca CHECKOUT_PENDING', () => {
    it('solo llama a releaseActiveReservations, no a closeCart', async () => {
      const releaseActive = jest.fn().mockResolvedValue(ok(undefined as never));
      const closeCart = jest.fn().mockResolvedValue(ok(undefined as never));

      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        cartReservation: { releaseActiveReservations: releaseActive, closeCart },
      });

      await uc.execute({ sessionId: 'session-1' });

      expect(releaseActive).toHaveBeenCalled();
      // closeCart NO se llama en logout (solo en guest→admin)
      expect(closeCart).not.toHaveBeenCalled();
    });
  });

  describe('Error técnico', () => {
    it('devuelve TECHNICAL_DEPENDENCY_FAILURE ante error inesperado', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
    });

    it('propaga error de releaseActiveReservations', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(activeSession)),
        },
        cartReservation: {
          releaseActiveReservations: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
    });

    it('propaga error de revoke', async () => {
      const uc = createUseCase(
{

        sessionRepo: {
          findById: jest.fn().mockResolvedValue(ok(activeSession)),
          revoke: jest.fn().mockResolvedValue(fail(technicalFailure())),
        },
        cartReservation: {
          releaseActiveReservations: jest.fn().mockResolvedValue(ok(undefined as never)),
        },
      });

      const result = await uc.execute({ sessionId: 'session-1' });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
    });
  });
});
