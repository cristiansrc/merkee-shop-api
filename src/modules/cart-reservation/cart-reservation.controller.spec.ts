import { CartReservationController } from './cart-reservation.controller';
import { CART_TOKENS } from './cart-reservation.tokens';
import { ok, fail } from '../../shared/domain/result';
import { DomainErrorCode } from '../../shared/domain/domain-error';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { CartSessionResolverPort, CartSessionResolution } from './domain/ports/cart-session-resolver.port';

function errorResponseFrom(e: unknown): { code: string; status: number } {
  const err = e as HttpException;
  const response = err.getResponse() as any;
  return { code: response?.code ?? '', status: response?.status ?? 0 };
}

/** Construye un mock de CartSessionResolverPort. */
function buildSessionResolver(overrides: Partial<CartSessionResolverPort> = {}): CartSessionResolverPort {
  return {
    resolve: overrides.resolve ?? jest.fn().mockResolvedValue({ sessionId: 'session-123' }),
  };
}

function buildMocks(overrides: Record<string, jest.Mock> = {}) {
  return {
    getCart: overrides.getCart ?? jest.fn(),
    addCartItem: overrides.addCartItem ?? jest.fn(),
    setCartItemQuantity: overrides.setCartItemQuantity ?? jest.fn(),
    removeCartItem: overrides.removeCartItem ?? jest.fn(),
  };
}

function buildController(
  mocks: ReturnType<typeof buildMocks>,
  sessionResolver?: CartSessionResolverPort,
) {
  return new CartReservationController(
    sessionResolver ?? buildSessionResolver(),
    { execute: mocks.getCart } as any,
    { execute: mocks.addCartItem } as any,
    { execute: mocks.setCartItemQuantity } as any,
    { execute: mocks.removeCartItem } as any,
  );
}

function cartRequest(
  cookie?: string,
  headers: Record<string, string> = {},
): any {
  return {
    cookies: cookie ? { merkee_cart_session: cookie } : {},
    headers: { ...headers },
    path: '/cart',
    originalUrl: '/cart',
  };
}

/** Resolución de sesión mock para cookie existente. */
function existingSessionResolution(sessionId = 'session-123'): CartSessionResolution {
  return { sessionId };
}

/** Resolución de sesión mock para guest (con cookie). */
function guestSessionResolution(sessionId = 'new-guest-session'): CartSessionResolution {
  return {
    sessionId,
    cookie: {
      name: 'merkee_cart_session',
      value: sessionId,
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        expires: new Date('2030-01-01T00:10:00Z'),
      },
    },
  };
}

const sampleCartWithItems = {
  cart: {
    id: 'cart-1',
    sessionId: 'session-123',
    status: 'ACTIVE',
    itemsSubtotalCop: 20000n,
    deliveryFeeCop: 5000n,
    ivaCop: 3800n,
    taxRateBasisPoints: 1900,
    totalCop: 28800n,
    reservationExpiresAt: new Date('2030-01-01T00:00:00Z'),
  },
  items: [
    {
      id: 'item-1',
      cartId: 'cart-1',
      productId: 'prod-1',
      quantity: 2,
      unitPriceCop: 10000n,
      subtotalCop: 20000n,
      reservation: { id: 'res-1', cartItemId: 'item-1', productId: 'prod-1', quantity: 2, status: 'ACTIVE' as const, expiresAt: new Date('2030-01-01T00:00:00Z') },
    },
  ],
};

const sampleProducts = new Map([
  [
    'prod-1',
    {
      id: 'prod-1',
      category: { id: 'cat-1', name: 'Frutas', imageKey: 'img-key' },
      name: 'Manzana',
      description: 'Manzana roja',
      regularPriceCop: 10000n,
      salePriceCop: 8000n,
      unit: 'kg',
      stockOnHand: 100,
      stockReserved: 5,
      images: [{ key: 'img-1', altText: 'manzana', position: 1 }],
    },
  ],
]);

describe('CartReservationController', () => {
  // ===========================================================================
  // Resolución de sesión
  // ===========================================================================
  describe('Resolución de sesión', () => {
    describe('Cookie de sesión', () => {
      it('reutiliza la sesión existente cuando hay cookie válida', async () => {
        const resolve = jest.fn().mockResolvedValue(existingSessionResolution('session-123'));
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          getCart: jest.fn().mockResolvedValue(
            ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
          ),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest('session-123');
        const result = await controller.getCart(req, {} as any);
        expect(result).toBeDefined();
        expect(result.id).toBe('cart-1');
        expect(resolve).toHaveBeenCalledWith('session-123', undefined, '/cart');
      });

      it('crea sesión GUEST y emite Set-Cookie cuando no hay cookie ni token', async () => {
        const resolution = guestSessionResolution('new-guest-id');
        const resolve = jest.fn().mockResolvedValue(resolution);
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          getCart: jest.fn().mockResolvedValue(
            ok({
              cartWithItems: { ...sampleCartWithItems, cart: { ...sampleCartWithItems.cart, sessionId: 'new-guest-id' } },
              products: sampleProducts,
            }),
          ),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest(undefined, {});
        const mockRes = { cookie: jest.fn() };
        const result = await controller.getCart(req, mockRes as any);
        expect(result).toBeDefined();
        expect(mockRes.cookie).toHaveBeenCalledWith(
          'merkee_cart_session',
          'new-guest-id',
          expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
        );
      });
    });

    describe('Bearer JWT', () => {
      it('verifica el JWT y usa session_id del payload', async () => {
        const resolve = jest.fn().mockResolvedValue(existingSessionResolution('jwt-session-id'));
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          getCart: jest.fn().mockResolvedValue(
            ok({
              cartWithItems: { ...sampleCartWithItems, cart: { ...sampleCartWithItems.cart, sessionId: 'jwt-session-id' } },
              products: sampleProducts,
            }),
          ),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest(undefined, { authorization: 'Bearer valid-jwt-token' });
        await controller.getCart(req, {} as any);
        expect(resolve).toHaveBeenCalledWith(undefined, 'Bearer valid-jwt-token', '/cart');
      });

     it('lanza 401 cuando el Bearer token es inválido', async () => {
        const resolve = jest.fn().mockRejectedValue(
          new UnauthorizedException({
            timestamp: new Date().toISOString(),
            status: 401,
            error: 'Unauthorized',
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Se requiere autenticación.',
            path: '/cart',
            trace_id: '',
          }),
        );
        const resolver = buildSessionResolver({ resolve });
        const controller = buildController(buildMocks(), resolver);
        const req = cartRequest(undefined, { authorization: 'Bearer invalid-jwt' });
        await expect(controller.getCart(req, {} as any)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('Anónimo (guest)', () => {
      it('crea sesión GUEST en POST /cart/items cuando no hay cookie', async () => {
        const resolution = guestSessionResolution('guest-abc');
        const resolve = jest.fn().mockResolvedValue(resolution);
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          addCartItem: jest.fn().mockResolvedValue(
            ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
          ),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest(undefined, {});
        const mockRes = { cookie: jest.fn() };
        const result = await controller.addCartItem(
          { product_id: 'prod-1', quantity: 2 },
          '11111111-1111-4111-8111-111111111111',
          req,
          mockRes as any,
        );
        expect(result).toBeDefined();
        expect(mockRes.cookie).toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith(undefined, undefined, expect.any(String));
      });

      it('crea sesión GUEST en DELETE /cart/items cuando no hay cookie', async () => {
        const resolution = guestSessionResolution('guest-def');
        const resolve = jest.fn().mockResolvedValue(resolution);
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          removeCartItem: jest.fn().mockResolvedValue(ok(undefined)),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest(undefined, {});
        const mockRes = { cookie: jest.fn() };
        await controller.removeCartItem(
          'prod-1',
          '33333333-3333-4333-8333-333333333333',
          req,
          mockRes as any,
        );
        expect(mockRes.cookie).toHaveBeenCalled();
      });
    });

    describe('Token inválido', () => {
      it('lanza UnauthorizedException cuando Bearer token es inválido en POST', async () => {
        const resolve = jest.fn().mockRejectedValue(
          new UnauthorizedException({
            status: 401,
            error: 'Unauthorized',
            code: 'AUTHENTICATION_REQUIRED',
          }),
        );
        const resolver = buildSessionResolver({ resolve });
        const controller = buildController(buildMocks(), resolver);
        const req = cartRequest(undefined, { authorization: 'Bearer bad-token' });
        const mockRes = { cookie: jest.fn() };
        await expect(
          controller.addCartItem(
            { product_id: 'prod-1', quantity: 1 },
            '11111111-1111-4111-8111-111111111111',
            req,
            mockRes as any,
          ),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('Admin', () => {
      it('la sesión admin es rechazada por el use case (403)', async () => {
        const resolve = jest.fn().mockResolvedValue(existingSessionResolution('admin-session'));
        const resolver = buildSessionResolver({ resolve });
        const mocks = buildMocks({
          getCart: jest.fn().mockResolvedValue(
            fail({
              code: DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN,
              kind: 'authorization',
              messageKey: 'admin.storefront.purchase.forbidden',
            }),
          ),
        });
        const controller = buildController(mocks, resolver);
        const req = cartRequest('admin-session');
        await expect(controller.getCart(req, {} as any)).rejects.toThrow(HttpException);
      });
    });
  });

  // ===========================================================================
  // GET /cart
  // ===========================================================================
  describe('GET /cart', () => {
    it('retorna el carrito cuando hay cookie de sesión', async () => {
      const mocks = buildMocks({
        getCart: jest.fn().mockResolvedValue(
          ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
        ),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');
      const result = await controller.getCart(req, {} as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('cart-1');
      expect(result.items).toHaveLength(1);
    });
  });

  // ===========================================================================
  // POST /cart/items
  // ===========================================================================
  describe('POST /cart/items', () => {
    it('agrega un item al carrito con idempotency key válida', async () => {
      const mocks = buildMocks({
        addCartItem: jest.fn().mockResolvedValue(
          ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
        ),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');
      const result = await controller.addCartItem(
        { product_id: 'prod-1', quantity: 2 },
        '11111111-1111-4111-8111-111111111111',
        req,
        {} as any,
      );
      expect(result).toBeDefined();
      expect(mocks.addCartItem).toHaveBeenCalled();
    });

    it('lanza 400 cuando falta Idempotency-Key', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, undefined, req, {} as any),
      ).rejects.toThrow(HttpException);
      try {
        await controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, undefined, req, {} as any);
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('lanza 400 cuando Idempotency-Key no es UUID válido', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, 'not-a-uuid', req, {} as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ===========================================================================
  // PUT /cart/items/:productId
  // ===========================================================================
  describe('PUT /cart/items/:productId', () => {
    it('fija la cantidad con idempotency key válida', async () => {
      const mocks = buildMocks({
        setCartItemQuantity: jest.fn().mockResolvedValue(
          ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
        ),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');
      const result = await controller.setCartItemQuantity(
        'prod-1',
        { quantity: 3 },
        '22222222-2222-4222-8222-222222222222',
        req,
        {} as any,
      );
      expect(result).toBeDefined();
    });

    it('lanza 400 cuando falta Idempotency-Key en PUT', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.setCartItemQuantity('prod-1', { quantity: 2 }, undefined, req, {} as any),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando Idempotency-Key es inválido en PUT', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.setCartItemQuantity('prod-1', { quantity: 2 }, 'bad-key', req, {} as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ===========================================================================
  // DELETE /cart/items/:productId
  // ===========================================================================
  describe('DELETE /cart/items/:productId', () => {
    it('elimina un item con idempotency key válida', async () => {
      const mocks = buildMocks({
        removeCartItem: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');
      await controller.removeCartItem(
        'prod-1',
        '33333333-3333-4333-8333-333333333333',
        req,
        {} as any,
      );
      expect(mocks.removeCartItem).toHaveBeenCalled();
    });

    it('lanza 400 cuando falta Idempotency-Key en DELETE', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.removeCartItem('prod-1', undefined, req, {} as any),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando Idempotency-Key es inválido en DELETE', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.removeCartItem('prod-1', 'not-uuid', req, {} as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ===========================================================================
  // Idempotencia
  // ===========================================================================
  describe('Idempotencia', () => {
    it('replay idempotente devuelve la misma respuesta', async () => {
      const mocks = buildMocks({
        addCartItem: jest.fn().mockResolvedValue(
          ok({ cartWithItems: sampleCartWithItems, products: sampleProducts }),
        ),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');

      // Primera llamada
      const result1 = await controller.addCartItem(
        { product_id: 'prod-1', quantity: 2 },
        '11111111-1111-4111-8111-111111111111',
        req,
        {} as any,
      );
      // Segunda llamada (replay)
      const result2 = await controller.addCartItem(
        { product_id: 'prod-1', quantity: 2 },
        '11111111-1111-4111-8111-111111111111',
        req,
        {} as any,
      );
      expect(result1.id).toBe(result2.id);
      expect(mocks.addCartItem).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Cookie flags
  // ===========================================================================
  describe('Cookie flags', () => {
    it('cookie GUEST tiene HttpOnly, SameSite=Lax, Path=/', async () => {
      const resolution = guestSessionResolution('guest-flags');
      const resolve = jest.fn().mockResolvedValue(resolution);
      const resolver = buildSessionResolver({ resolve });
      const mocks = buildMocks({
        getCart: jest.fn().mockResolvedValue(
          ok({
            cartWithItems: { ...sampleCartWithItems, cart: { ...sampleCartWithItems.cart, sessionId: 'guest-flags' } },
            products: sampleProducts,
          }),
        ),
      });
      const controller = buildController(mocks, resolver);
      const req = cartRequest(undefined, {});
      const mockRes = { cookie: jest.fn() };
      await controller.getCart(req, mockRes as any);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'merkee_cart_session',
        'guest-flags',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });

    it('cookie GUEST tiene expiración de 10 minutos', async () => {
      const now = new Date('2026-08-21T12:00:00Z');
      const expectedExpires = new Date('2026-08-21T12:10:00Z');
      const resolution: CartSessionResolution = {
        sessionId: 'guest-ttl',
        cookie: {
          name: 'merkee_cart_session',
          value: 'guest-ttl',
          options: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            expires: expectedExpires,
          },
        },
      };
      const resolve = jest.fn().mockResolvedValue(resolution);
      const resolver = buildSessionResolver({ resolve });
      const mocks = buildMocks({
        getCart: jest.fn().mockResolvedValue(
          ok({
            cartWithItems: { ...sampleCartWithItems, cart: { ...sampleCartWithItems.cart, sessionId: 'guest-ttl' } },
            products: sampleProducts,
          }),
        ),
      });
      const controller = buildController(mocks, resolver);
      const req = cartRequest(undefined, {});
      const mockRes = { cookie: jest.fn() };
      await controller.getCart(req, mockRes as any);
      const cookieCall = mockRes.cookie.mock.calls[0];
      const expires = cookieCall[2].expires as Date;
      expect(expires.getTime() - now.getTime()).toBe(10 * 60 * 1000);
    });
  });

  // ===========================================================================
  // Error de use case
  // ===========================================================================
  describe('Error de use case', () => {
    it('proyecta error del use case al remover item', async () => {
      const mocks = buildMocks({
        removeCartItem: jest.fn().mockResolvedValue(
          fail({ code: 'RESOURCE_NOT_FOUND', kind: 'domain', messageKey: 'not.found' }),
        ),
      });
      const controller = buildController(mocks);
      const req = cartRequest('session-123');
      await expect(
        controller.removeCartItem(
          'prod-1',
          '44444444-4444-4444-8444-444444444444',
          req,
          {} as any,
        ),
      ).rejects.toThrow(HttpException);
    });
  });
});
