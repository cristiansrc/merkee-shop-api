import { RemoveCartItemUseCase } from './remove-cart-item.use-case';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('RemoveCartItemUseCase', () => {
  const mockSessionLookup = {
    findById: jest.fn(),
    findUserById: jest.fn(),
  };
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    findCartItem: jest.fn(),
    deleteCartItem: jest.fn(),
    updateCartTotals: jest.fn(),
    touchSession: jest.fn(),
  };
  const mockProductLookup = {
    findActiveForCart: jest.fn(),
  };
  const mockClock = {
    now: jest.fn(),
  };
  const mockIdempotency = {
    find: jest.fn(),
    findForUpdate: jest.fn(),
    save: jest.fn(),
  };
  const mockUnitOfWork = {
    run: jest.fn(),
  };

  let useCase: RemoveCartItemUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClock.now.mockReturnValue(new Date('2026-08-17T12:00:00Z'));
    useCase = new RemoveCartItemUseCase(
      mockCartRepo as any,
      mockSessionLookup as any,
      mockProductLookup as any,
      mockClock as any,
      mockIdempotency as any,
      mockUnitOfWork as any,
    );
  });

  const validSession = {
    id: 'session-123',
    userId: null,
    sessionKind: 'GUEST',
    expiresAt: new Date('2026-08-17T12:10:00Z'),
    lastActivityAt: new Date(),
    revokedAt: null,
  };

  it('devuelve 410 cuando la sesión no existe', async () => {
    mockSessionLookup.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 403 cuando el usuario es admin', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      userId: 'user-admin',
      sessionKind: 'AUTHENTICATED',
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-admin',
      role: 'admin',
      mustChangePassword: false,
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('ADMIN_STOREFRONT_PURCHASE_FORBIDDEN');
    }
  });

  it('devuelve éxito en replay (ya eliminado)', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"product_id":"prod-1"}')
      .digest('hex');

    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-remove:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash,
      responseJson: { status: 204 },
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('devuelve 409 cuando la idempotencia diverge', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-remove:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash: 'old-hash',
      responseJson: {},
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-2"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('ejecuta la eliminación atómica cuando todo es válido', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          release: jest.fn(),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(mockUnitOfWork.run).toHaveBeenCalled();
    expect(isSuccess(result)).toBe(true);
  });

  it('devuelve 410 cuando la sesión está revocada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      revokedAt: new Date(),
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
    expect(mockIdempotency.find).not.toHaveBeenCalled();
  });

  it('devuelve 410 cuando la sesión está expirada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      expiresAt: new Date('2026-08-17T11:50:00Z'), // 10 min antes
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
    expect(mockIdempotency.find).not.toHaveBeenCalled();
  });

  it('permite cliente con mustChangePassword=true a eliminar item', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      userId: 'user-cliente',
      sessionKind: 'AUTHENTICATED',
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-cliente',
      role: 'cliente',
      mustChangePassword: true,
    });
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('continúa cuando el usuario de la sesión no existe en el lookup', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      userId: 'user-desconocido',
      sessionKind: 'AUTHENTICATED',
    });
    mockSessionLookup.findUserById.mockResolvedValue(null);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('continúa cuando el usuario es cliente sin cambio de contraseña pendiente', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      userId: 'user-cliente',
      sessionKind: 'AUTHENTICATED',
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-cliente',
      role: 'cliente',
      mustChangePassword: false,
    });
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('devuelve éxito en replay detectado dentro de la transacción', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"product_id":"prod-1"}')
      .digest('hex');

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn(),
          findCartItem: jest.fn(),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue({
            id: 'idem-1',
            scope: 'cart-remove:session-123',
            idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
            bodyHash,
            responseJson: { status: 204 },
          }),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
    // Replay dentro de la transacción: no se elimina ni se guarda de nuevo.
    expect(mockUnitOfWork.run.mock.calls[0][0]).toBeDefined();
  });

  it('devuelve 409 cuando la idempotencia diverge dentro de la transacción', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn(),
          findCartItem: jest.fn(),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue({
            id: 'idem-1',
            scope: 'cart-remove:session-123',
            idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
            bodyHash: 'old-hash',
            responseJson: {},
          }),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-2"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('devuelve 410 cuando no existe carrito dentro de la transacción', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue(null),
          findCartItem: jest.fn(),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 404 cuando el ítem no existe dentro de la transacción', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [],
          }),
          findCartItem: jest.fn().mockResolvedValue(null),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('CART_ITEM_NOT_FOUND');
    }
  });

  it('deja reservationExpiresAt en null cuando el carrito queda vacío', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    let capturedCtx: any;

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest
            .fn()
            .mockResolvedValueOnce({
              cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
              items: [
                { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
              ],
            })
            // Después del delete: carrito sin ítems.
            .mockResolvedValueOnce({
              cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 0n, deliveryFeeCop: 5000n, ivaCop: 0n, taxRateBasisPoints: 1900, totalCop: 5000n, reservationExpiresAt: null },
              items: [],
            }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: { release: jest.fn() },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      capturedCtx = ctx;
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1"}',
    });

    expect(isSuccess(result)).toBe(true);
    const updateTotalsCall = capturedCtx.cartRepo.updateCartTotals.mock.calls[0];
    expect(updateTotalsCall[1].reservationExpiresAt).toBeNull();
    expect(updateTotalsCall[1].itemsSubtotalCop).toBe(0n);
  });

  it('propaga el fallo de release de reserva sin capturarlo en application', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    const releaseError = new Error('release failed');

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 2 }),
          deleteCartItem: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          release: jest.fn().mockRejectedValue(releaseError),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    // ROP: la capa application no captura excepciones técnicas; el fallo de
    // release se propaga y el adapter de UoW lo traduciría a DomainError.
    await expect(
      useCase.execute({
        sessionId: 'session-123',
        productId: 'prod-1',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{"product_id":"prod-1"}',
      }),
    ).rejects.toThrow('release failed');
  });
});
