import { CartReservationController } from './cart-reservation.controller';
import { CART_TOKENS } from './cart-reservation.tokens';
import { ok, fail } from '../../shared/domain/result';
import { DomainErrorCode } from '../../shared/domain/domain-error';
import { HttpException } from '@nestjs/common';

function errorResponseFrom(e: unknown): { code: string; status: number } {
  const err = e as HttpException;
  const response = err.getResponse() as any;
  return { code: response?.code ?? '', status: response?.status ?? 0 };
}

function buildMocks(overrides: Record<string, jest.Mock> = {}) {
  return {
    getCart: overrides.getCart ?? jest.fn(),
    addCartItem: overrides.addCartItem ?? jest.fn(),
    setCartItemQuantity: overrides.setCartItemQuantity ?? jest.fn(),
    removeCartItem: overrides.removeCartItem ?? jest.fn(),
  };
}

function buildController(mocks: ReturnType<typeof buildMocks>) {
  return new CartReservationController(
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

    it('lanza 401 cuando no hay cookie ni token', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest(undefined, {});
      await expect(controller.getCart(req, {} as any)).rejects.toThrow(HttpException);
    });

    it('lanza 401 cuando hay Bearer token pero no cookie', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest(undefined, { authorization: 'Bearer some-jwt' });
      await expect(controller.getCart(req, {} as any)).rejects.toThrow(HttpException);
    });
  });

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
      );
      expect(result).toBeDefined();
      expect(mocks.addCartItem).toHaveBeenCalled();
    });

    it('lanza 400 cuando falta Idempotency-Key', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, undefined, req),
      ).rejects.toThrow(HttpException);
      try {
        await controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, undefined, req);
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('lanza 400 cuando Idempotency-Key no es UUID válido', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.addCartItem({ product_id: 'prod-1', quantity: 1 }, 'not-a-uuid', req),
      ).rejects.toThrow(HttpException);
    });
  });

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
      );
      expect(result).toBeDefined();
    });

    it('lanza 400 cuando falta Idempotency-Key en PUT', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.setCartItemQuantity('prod-1', { quantity: 2 }, undefined, req),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando Idempotency-Key es inválido en PUT', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.setCartItemQuantity('prod-1', { quantity: 2 }, 'bad-key', req),
      ).rejects.toThrow(HttpException);
    });
  });

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
      );
      expect(mocks.removeCartItem).toHaveBeenCalled();
    });

    it('lanza 400 cuando falta Idempotency-Key en DELETE', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.removeCartItem('prod-1', undefined, req),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando Idempotency-Key es inválido en DELETE', async () => {
      const controller = buildController(buildMocks());
      const req = cartRequest('session-123');
      await expect(
        controller.removeCartItem('prod-1', 'not-uuid', req),
      ).rejects.toThrow(HttpException);
    });
  });

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
        ),
      ).rejects.toThrow(HttpException);
    });
  });
});
