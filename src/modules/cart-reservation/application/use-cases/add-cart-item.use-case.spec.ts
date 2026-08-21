import { AddCartItemUseCase, AddCartItemCommand } from './add-cart-item.use-case';
import { CartErrors } from '../../domain/cart-errors';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('AddCartItemUseCase', () => {
  const mockSessionLookup = {
    findById: jest.fn(),
    findUserById: jest.fn(),
  };
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    createCart: jest.fn(),
    findCartItem: jest.fn(),
    createCartItem: jest.fn(),
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

  let useCase: AddCartItemUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClock.now.mockReturnValue(new Date('2026-08-17T12:00:00Z'));
    useCase = new AddCartItemUseCase(
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

  const validProduct = {
    id: 'prod-1',
    name: 'Producto Test',
    regularPriceCop: 5000n,
    salePriceCop: 0n,
    unit: 'kg',
    stockOnHand: 10,
    stockReserved: 2,
    images: [],
    category: { id: 'cat-1', name: 'Categoría', imageKey: 'key' },
  };

  it('devuelve 410 cuando la sesión no existe', async () => {
    mockSessionLookup.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('ADMIN_STOREFRONT_PURCHASE_FORBIDDEN');
    }
  });

  it('devuelve replay cuando la idempotencia ya existe con mismo hash', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-add:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash: 'same-hash',
      responseJson: {
        cartWithItems: { cart: { id: 'cart-1' }, items: [] },
        products: new Map(),
        createdCartItem: true,
      },
    });

    // Mock para que el bodyHash coincida
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"product_id":"prod-1","quantity":1}')
      .digest('hex');

    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-add:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash,
      responseJson: {
        cartWithItems: { cart: { id: 'cart-1' }, items: [] },
        products: new Map(),
        createdCartItem: true,
      },
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('devuelve 409 cuando la idempotencia diverge', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue({
      id: 'idem-1',
      scope: 'cart-add:session-123',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      bodyHash: 'different-hash',
      responseJson: {},
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":2}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('devuelve 404 cuando el producto no existe', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(null);

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-inexistente',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-inexistente","quantity":1}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('ejecuta la reserva atómica cuando todo es válido', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    const mockResult = {
      cartWithItems: { cart: { id: 'cart-1' }, items: [] },
      products: new Map([['prod-1', validProduct]]),
      createdCartItem: true,
    };

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', status: 'ACTIVE', itemsSubtotalCop: 0n, deliveryFeeCop: 5000n, ivaCop: 0n, taxRateBasisPoints: 1900, totalCop: 5000n, reservationExpiresAt: null },
            items: [],
          }),
          createCart: jest.fn().mockResolvedValue({ id: 'cart-new' }),
          findCartItem: jest.fn().mockResolvedValue(null),
          createCartItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          reserve: jest.fn().mockResolvedValue({ id: 'res-1' }),
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
      quantity: 2,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":2}',
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 410 cuando la sesión expiró', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      ...validSession,
      expiresAt: new Date('2026-08-17T11:59:59Z'),
    });

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('retorna replay desde UoW cuando idempotencia detecta carrera', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    // Calcular el hash real del canonicalBody para que el mock coincida con la comparación en producción
    const crypto = require('crypto');
    const bodyHash = crypto.createHash('sha256')
      .update('{"product_id":"prod-1","quantity":1}')
      .digest('hex');

    const replayResponse = {
      cartWithItems: { cart: { id: 'cart-1' }, items: [] },
      products: new Map([['prod-1', validProduct]]),
      createdCartItem: true,
    };

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn(),
        },
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.createdCartItem).toBe(true);
    }
  });

  it('devuelve 409 cuando UoW detecta idempotencia divergente', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn(),
        },
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('crea nuevo carrito cuando no existe para la sesión', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
              cart: { id: 'cart-new', status: 'ACTIVE', itemsSubtotalCop: 5000n, deliveryFeeCop: 5000n, ivaCop: 950n, taxRateBasisPoints: 1900, totalCop: 10950n, reservationExpiresAt: new Date() },
              items: [{ id: 'item-1', productId: 'prod-1', quantity: 1, unitPriceCop: 5000n, subtotalCop: 5000n, reservation: { id: 'res-1', status: 'ACTIVE' } }],
            }),
          createCart: jest.fn().mockResolvedValue({ id: 'cart-new' }),
          findCartItem: jest.fn().mockResolvedValue(null),
          createCartItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          reserve: jest.fn().mockResolvedValue({ id: 'res-1' }),
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
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.createdCartItem).toBe(true);
    }
  });

  it('ajusta cantidad cuando producto ya existe en carrito', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', status: 'ACTIVE', itemsSubtotalCop: 10000n, deliveryFeeCop: 5000n, ivaCop: 1900n, taxRateBasisPoints: 1900, totalCop: 16900n, reservationExpiresAt: new Date() },
            items: [{ id: 'item-1', productId: 'prod-1', quantity: 2, unitPriceCop: 5000n, subtotalCop: 10000n, reservation: { id: 'res-1', status: 'ACTIVE' } }],
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

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
    });

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.createdCartItem).toBe(false);
    }
  });

  it('usa salePriceCop cuando está disponible', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    const productWithSale = { ...validProduct, salePriceCop: 4000n };
    mockProductLookup.findActiveForCart.mockResolvedValue(productWithSale);

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', status: 'ACTIVE', itemsSubtotalCop: 0n, deliveryFeeCop: 5000n, ivaCop: 0n, taxRateBasisPoints: 1900, totalCop: 5000n, reservationExpiresAt: null },
            items: [],
          }),
          createCart: jest.fn().mockResolvedValue({ id: 'cart-new' }),
          findCartItem: jest.fn().mockResolvedValue(null),
          createCartItem: jest.fn().mockResolvedValue({ id: 'item-1', unitPriceCop: 4000n }),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          reserve: jest.fn().mockResolvedValue({ id: 'res-1' }),
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
      quantity: 2,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":2}',
    });

    expect(isSuccess(result)).toBe(true);
  });

  it('carga todos los productos del carrito, no solo el mutado', async () => {
    mockSessionLookup.findById.mockResolvedValue(validSession);
    mockIdempotency.find.mockResolvedValue(null);
    mockProductLookup.findActiveForCart.mockResolvedValue(validProduct);

    const secondProduct = {
      id: 'prod-2',
      name: 'Producto Test 2',
      regularPriceCop: 3000n,
      salePriceCop: 0n,
      unit: 'kg',
      stockOnHand: 20,
      stockReserved: 3,
      images: [],
      category: { id: 'cat-2', name: 'Categoría 2', imageKey: 'key2' },
    };

    mockUnitOfWork.run.mockImplementation(async (work) => {
      const ctx = {
        cartRepo: {
          findCartWithItems: jest.fn().mockResolvedValue({
            cart: { id: 'cart-1', status: 'ACTIVE', itemsSubtotalCop: 8000n, deliveryFeeCop: 5000n, ivaCop: 1520n, taxRateBasisPoints: 1900, totalCop: 14520n, reservationExpiresAt: new Date() },
            items: [
              { id: 'item-1', productId: 'prod-1', quantity: 1, unitPriceCop: 5000n, subtotalCop: 5000n, reservation: { id: 'res-1', status: 'ACTIVE' } },
              { id: 'item-2', productId: 'prod-2', quantity: 1, unitPriceCop: 3000n, subtotalCop: 3000n, reservation: { id: 'res-2', status: 'ACTIVE' } },
            ],
          }),
          createCart: jest.fn().mockResolvedValue({ id: 'cart-new' }),
          findCartItem: jest.fn().mockResolvedValue(null),
          createCartItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
          updateCartTotals: jest.fn(),
          touchSession: jest.fn(),
        },
        stockReservation: {
          reserve: jest.fn().mockResolvedValue({ id: 'res-1' }),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        },
      };
      return work(ctx);
    });

    mockProductLookup.findActiveForCartByIds.mockResolvedValue(
      new Map([['prod-1', validProduct], ['prod-2', secondProduct]]),
    );

    const result = await useCase.execute({
      sessionId: 'session-123',
      productId: 'prod-1',
      quantity: 1,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"product_id":"prod-1","quantity":1}',
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
