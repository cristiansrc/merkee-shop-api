import { SetCartItemQuantityUseCase } from './set-cart-item-quantity.use-case';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('SetCartItemQuantityUseCase', () => {
  const mockSessionLookup = {
    findById: jest.fn(),
    findUserById: jest.fn(),
  };
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    findCartItem: jest.fn(),
    updateCartItemQuantity: jest.fn(),
    updateCartTotals: jest.fn(),
    touchSession: jest.fn(),
  };
  const mockProductLookup = {
    findActiveForCart: jest.fn(),
    findActiveForCartByIds: jest.fn(),
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

  let useCase: SetCartItemQuantityUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClock.now.mockReturnValue(new Date('2026-08-17T12:00:00Z'));
    useCase = new SetCartItemQuantityUseCase(
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

  it('devuelve 410 cuando la sesión expira', async () => {
    mockSessionLookup.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 3,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":3}',
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
      quantity: 3,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":3}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('ADMIN_STOREFRONT_PURCHASE_FORBIDDEN');
    }
  });

  it('devuelve 409 cuando la idempotencia diverge', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-set-qty:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash: 'old-hash',
      responseJson: {},
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('ejecuta el ajuste atómico cuando todo es válido', async () => {
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
          updateCartItemQuantity: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          adjustReservation: jest.fn(),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    mockProductLookup.findActiveForCart.mockResolvedValue({
      id: 'prod-1',
      name: 'Test',
      regularPriceCop: 5000n,
      salePriceCop: 0n,
      unit: 'kg',
      stockOnHand: 10,
      stockReserved: 2,
      images: [],
      category: { id: 'cat-1', name: 'Cat', imageKey: 'k' },
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(mockUnitOfWork.run).toHaveBeenCalled();
  });

  it('devuelve 410 cuando la sesión está revocada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      revokedAt: new Date(),
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 3,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":3}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve INITIAL_PASSWORD_CHANGE_REQUIRED cuando mustChangePassword es true', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      userId: 'user-1',
      sessionKind: 'AUTHENTICATED',
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-1',
      role: 'cliente',
      mustChangePassword: true,
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 3,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":3}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('devuelve replay cuando idempotencia existe con mismo hash', async () => {
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"quantity":5}')
      .digest('hex');

    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-set-qty:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash,
      responseJson: {
        cartWithItems: { cart: { id: 'cart-1' }, items: [] },
        products: new Map(),
      },
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('retorna replay desde UoW cuando idempotencia detecta carrera', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    // Calcular el hash real del canonicalBody para que el mock coincida con la comparación en producción
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"quantity":5}')
      .digest('hex');

    const replayResponse = {
      cartWithItems: { cart: { id: 'cart-1' }, items: [] },
      products: new Map(),
    };

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {},
        stockReservation: {},
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue({
            bodyHash,
            responseJson: replayResponse,
          }),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('devuelve 409 cuando UoW detecta idempotencia divergente', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {},
        stockReservation: {},
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue({
            bodyHash: 'different-hash',
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
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('devuelve 410 cuando no existe carrito para la sesión', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue(null),
        },
        stockReservation: {},
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
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 404 cuando el producto no está en el carrito', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 0n, deliveryFeeCop: 5000n, ivaCop: 0n, taxRateBasisPoints: 1900, totalCop: 5000n, reservationExpiresAt: null },
            items: [],
          }),
          findCartItem: jest.fn().mockResolvedValue(null),
        },
        stockReservation: {},
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
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('CART_ITEM_NOT_FOUND');
    }
  });

  it('devuelve 422 cuando la reserva no está activa', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 5000n, deliveryFeeCop: 5000n, ivaCop: 950n, taxRateBasisPoints: 1900, totalCop: 10950n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 1, unitPriceCop: 5000n, subtotalCop: 5000n, reservation: null },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 1 }),
        },
        stockReservation: {},
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
      quantity: 5,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":5}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('RESERVATION_NOT_ACTIVE');
    }
  });

  it('carga todos los productos del carrito, no solo el mutado', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);

    const product1 = {
      id: 'prod-1',
      name: 'Producto Test 1',
      regularPriceCop: 5000n,
      salePriceCop: 0n,
      unit: 'kg',
      stockOnHand: 10,
      stockReserved: 2,
      images: [],
      category: { id: 'cat-1', name: 'Cat 1', imageKey: 'k1' },
    };

    const product2 = {
      id: 'prod-2',
      name: 'Producto Test 2',
      regularPriceCop: 3000n,
      salePriceCop: 0n,
      unit: 'kg',
      stockOnHand: 20,
      stockReserved: 3,
      images: [],
      category: { id: 'cat-2', name: 'Cat 2', imageKey: 'k2' },
    };

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', sessionId: 'session-123', status: 'ACTIVE', itemsSubtotalCop: 8000n, deliveryFeeCop: 5000n, ivaCop: 1520n, taxRateBasisPoints: 1900, totalCop: 14520n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 1, unitPriceCop: 5000n, subtotalCop: 5000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
              { id: 'item-2', productId: 'prod-2', quantity: 1, unitPriceCop: 3000n, subtotalCop: 3000n, reservation: { id: 'res-2', status: 'ACTIVE' } },
            ],
          }),
          findCartItem: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 1 }),
          updateCartItemQuantity: jest.fn(),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          adjustReservation: jest.fn(),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    mockProductLookup.findActiveForCart.mockResolvedValue(product1);
    mockProductLookup.findActiveForCartByIds.mockResolvedValue(
      new Map([['prod-1', product1], ['prod-2', product2]]),
    );

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 3,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"quantity":3}',
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.products.size).toBe(2);
      expect(result.value.products.has('prod-1')).toBe(true);
      expect(result.value.products.has('prod-2')).toBe(true);
    }
    expect(mockProductLookup.findActiveForCartByIds).toHaveBeenCalledWith(['prod-1', 'prod-2']);
  });
});
