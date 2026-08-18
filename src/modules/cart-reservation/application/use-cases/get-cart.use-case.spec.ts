import { GetCartUseCase, GetCartResult } from './get-cart.use-case';
import { CartErrors } from '../../domain/cart-errors';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('GetCartUseCase', () => {
  const mockSessionLookup = {
    findById: jest.fn(),
    findUserById: jest.fn(),
  };
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    touchSession: jest.fn(),
  };
  const mockProductLookup = {
    findActiveForCart: jest.fn(),
  };
  const mockClock = {
    now: jest.fn(),
  };

  let useCase: GetCartUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClock.now.mockReturnValue(new Date('2026-08-17T12:00:00Z'));
    useCase = new GetCartUseCase(
      mockCartRepo as any,
      mockSessionLookup as any,
      mockProductLookup as any,
      mockClock as any,
    );
  });

  it('devuelve 410 cuando la sesión no existe', async () => {
    mockSessionLookup.findById.mockResolvedValue(null);

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 410 cuando la sesión está revocada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: new Date(),
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 410 cuando la sesión está expirada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T11:50:00Z'), // 10 min antes
      lastActivityAt: new Date(),
      revokedAt: null,
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
  });

  it('devuelve 403 cuando el usuario es admin', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: 'user-admin',
      sessionKind: 'AUTHENTICATED',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-admin',
      role: 'admin',
      mustChangePassword: false,
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('ADMIN_STOREFRONT_PURCHASE_FORBIDDEN');
    }
  });

  it('devuelve 403 cuando el admin debe cambiar contraseña', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: 'user-admin',
      sessionKind: 'AUTHENTICATED',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-admin',
      role: 'admin',
      mustChangePassword: true,
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      // Admin siempre recibe 403 en carrito, independientemente de must_change_password
      expect(result.error.code).toBe('ADMIN_STOREFRONT_PURCHASE_FORBIDDEN');
    }
  });

  it('devuelve 410 cuando la reserva está expirada', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 10000n,
        deliveryFeeCop: 5000n,
        ivaCop: 1900n,
        taxRateBasisPoints: 1900,
        totalCop: 16900n,
        reservationExpiresAt: new Date('2026-08-17T11:50:00Z'), // Expirada
      },
      items: [],
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('CART_RESERVATION_EXPIRED');
    }
  });

  it('devuelve 403 cuando un cliente debe cambiar contraseña', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: 'user-cliente',
      sessionKind: 'AUTHENTICATED',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-cliente',
      role: 'cliente',
      mustChangePassword: true,
    });

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
    }
    expect(mockCartRepo.findCartWithItems).not.toHaveBeenCalled();
  });

  it('continúa cuando el usuario de la sesión no existe en el lookup', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: 'user-desconocido',
      sessionKind: 'AUTHENTICATED',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockSessionLookup.findUserById.mockResolvedValue(null);
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 0n,
        deliveryFeeCop: 5000n,
        ivaCop: 0n,
        taxRateBasisPoints: 1900,
        totalCop: 5000n,
        reservationExpiresAt: new Date('2026-08-17T12:10:00Z'),
      },
      items: [],
    });

    const result = await useCase.execute('session-123');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.cartWithItems.cart.id).toBe('cart-1');
      expect(result.value.products.size).toBe(0);
    }
  });

  it('continúa cuando el usuario es cliente sin cambio de contraseña pendiente', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: 'user-cliente',
      sessionKind: 'AUTHENTICATED',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockSessionLookup.findUserById.mockResolvedValue({
      id: 'user-cliente',
      role: 'cliente',
      mustChangePassword: false,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 0n,
        deliveryFeeCop: 5000n,
        ivaCop: 0n,
        taxRateBasisPoints: 1900,
        totalCop: 5000n,
        reservationExpiresAt: new Date('2026-08-17T12:10:00Z'),
      },
      items: [],
    });

    const result = await useCase.execute('session-123');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.cartWithItems.cart.id).toBe('cart-1');
    }
  });

  it('devuelve 410 cuando la sesión es válida pero no existe carrito', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue(null);

    const result = await useCase.execute('session-123');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('SESSION_EXPIRED');
    }
    expect(mockCartRepo.touchSession).not.toHaveBeenCalled();
  });

  it('devuelve Success con carrito vacío y renueva sesión', async () => {
    const now = new Date('2026-08-17T12:00:00Z');
    mockClock.now.mockReturnValue(now);
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 0n,
        deliveryFeeCop: 5000n,
        ivaCop: 0n,
        taxRateBasisPoints: 1900,
        totalCop: 5000n,
        reservationExpiresAt: new Date('2026-08-17T12:10:00Z'),
      },
      items: [],
    });

    const result = await useCase.execute('session-123');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.cartWithItems.items).toHaveLength(0);
      expect(result.value.products.size).toBe(0);
    }
    expect(mockProductLookup.findActiveForCart).not.toHaveBeenCalled();
    expect(mockCartRepo.touchSession).toHaveBeenCalledWith('session-123', now);
  });

  it('omite productos inactivos o no encontrados del mapa de respuesta', async () => {
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 10000n,
        deliveryFeeCop: 5000n,
        ivaCop: 1900n,
        taxRateBasisPoints: 1900,
        totalCop: 16900n,
        reservationExpiresAt: new Date('2026-08-17T12:10:00Z'),
      },
      items: [
        {
          id: 'item-1',
          cartId: 'cart-1',
          productId: 'prod-inactivo',
          quantity: 1,
          unitPriceCop: 10000n,
          subtotalCop: 10000n,
          reservation: null,
        },
      ],
    });
    mockProductLookup.findActiveForCart.mockResolvedValue(null);

    const result = await useCase.execute('session-123');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.products.size).toBe(0);
    }
    expect(mockProductLookup.findActiveForCart).toHaveBeenCalledWith(
      'prod-inactivo',
    );
  });

  it('devuelve Success con el carrito y renueva sesión', async () => {
    const now = new Date('2026-08-17T12:00:00Z');
    mockClock.now.mockReturnValue(now);
    mockSessionLookup.findById.mockResolvedValue({
      id: 'session-123',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date('2026-08-17T12:10:00Z'),
      lastActivityAt: new Date(),
      revokedAt: null,
    });
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: {
        id: 'cart-1',
        sessionId: 'session-123',
        status: 'ACTIVE',
        itemsSubtotalCop: 10000n,
        deliveryFeeCop: 5000n,
        ivaCop: 1900n,
        taxRateBasisPoints: 1900,
        totalCop: 16900n,
        reservationExpiresAt: new Date('2026-08-17T12:10:00Z'),
      },
      items: [
        {
          id: 'item-1',
          cartId: 'cart-1',
          productId: 'prod-1',
          quantity: 2,
          unitPriceCop: 5000n,
          subtotalCop: 10000n,
          reservation: {
            id: 'res-1',
            cartItemId: 'item-1',
            productId: 'prod-1',
            quantity: 2,
            status: 'ACTIVE',
            expiresAt: new Date('2026-08-17T12:10:00Z'),
          },
        },
      ],
    });
    mockProductLookup.findActiveForCart.mockResolvedValue({
      id: 'prod-1',
      name: 'Producto Test',
      regularPriceCop: 5000n,
      salePriceCop: 0n,
      unit: 'kg',
      stockOnHand: 10,
      stockReserved: 2,
      images: [],
      category: { id: 'cat-1', name: 'Categoría', imageKey: 'key' },
    });

    const result = await useCase.execute('session-123');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.cartWithItems.cart.id).toBe('cart-1');
      expect(result.value.cartWithItems.items).toHaveLength(1);
      expect(result.value.products.size).toBe(1);
    }
    expect(mockCartRepo.touchSession).toHaveBeenCalledWith('session-123', now);
  });
});
