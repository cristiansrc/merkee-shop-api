import { PrismaCartRepositoryAdapter } from './prisma-cart-repository.adapter';

function buildMockPrisma() {
  return {
    cart: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    session: {
      update: jest.fn(),
    },
  };
}

function makeCartWithItems() {
  return {
    id: 'cart-1',
    sessionId: 's1',
    status: 'ACTIVE',
    itemsSubtotalCop: 10000n,
    deliveryFeeCop: 5000n,
    ivaCop: 1900n,
    taxRateBasisPoints: 1900,
    totalCop: 16900n,
    reservationExpiresAt: null,
    items: [
      {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
        reservation: {
          id: 'res-1',
          cartItemId: 'item-1',
          productId: 'p1',
          quantity: 1,
          status: 'ACTIVE',
          expiresAt: null,
        },
      },
    ],
  };
}

describe('PrismaCartRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaCartRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaCartRepositoryAdapter(prisma as any);
  });

  describe('findCartWithItems', () => {
    it('retorna carrito con items y reservas', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(makeCartWithItems());
      const result = await adapter.findCartWithItems('s1');
      expect(result).not.toBeNull();
      expect(result?.cart.id).toBe('cart-1');
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].reservation).not.toBeNull();
    });

    it('retorna null cuando no existe', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findCartWithItems('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findCartWithItemsByCartId', () => {
    it('retorna carrito por cartId', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(makeCartWithItems());
      const result = await adapter.findCartWithItemsByCartId('cart-1');
      expect(result).not.toBeNull();
    });

    it('retorna null cuando no existe', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findCartWithItemsByCartId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createCart', () => {
    it('crea carrito exitosamente', async () => {
      (prisma.cart.create as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        sessionId: 's1',
        status: 'ACTIVE',
        itemsSubtotalCop: 0n,
        deliveryFeeCop: 5000n,
        ivaCop: 0n,
        taxRateBasisPoints: 1900,
        totalCop: 5000n,
        reservationExpiresAt: null,
      });
      const result = await adapter.createCart('s1');
      expect(result.id).toBe('cart-1');
    });
  });

  describe('updateCartTotals', () => {
    it('actualiza totales del carrito', async () => {
      (prisma.cart.update as jest.Mock).mockResolvedValue({});
      await adapter.updateCartTotals('cart-1', {
        itemsSubtotalCop: 20000n,
        ivaCop: 3800n,
        totalCop: 28800n,
        reservationExpiresAt: null,
      });
      expect(prisma.cart.update).toHaveBeenCalled();
    });
  });

  describe('findCartItem', () => {
    it('retorna item del carrito', async () => {
      (prisma.cartItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
      });
      const result = await adapter.findCartItem('cart-1', 'p1');
      expect(result).not.toBeNull();
    });

    it('retorna null cuando no existe', async () => {
      (prisma.cartItem.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findCartItem('cart-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findCartItemById', () => {
    it('retorna item por id con reserva', async () => {
      (prisma.cartItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
        reservation: {
          id: 'res-1',
          cartItemId: 'item-1',
          productId: 'p1',
          quantity: 1,
          status: 'ACTIVE',
          expiresAt: null,
        },
      });
      const result = await adapter.findCartItemById('item-1');
      expect(result).not.toBeNull();
      expect(result?.reservation).not.toBeNull();
    });

    it('retorna null cuando no existe', async () => {
      (prisma.cartItem.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findCartItemById('nonexistent');
      expect(result).toBeNull();
    });

    it('retorna item sin reserva cuando reservation es null', async () => {
      (prisma.cartItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
        reservation: null,
      });
      const result = await adapter.findCartItemById('item-1');
      expect(result).not.toBeNull();
      expect(result?.reservation).toBeNull();
    });
  });

  describe('createCartItem', () => {
    it('crea item del carrito', async () => {
      (prisma.cartItem.create as jest.Mock).mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
      });
      const result = await adapter.createCartItem({
        cartId: 'cart-1',
        productId: 'p1',
        quantity: 1,
        unitPriceCop: 10000n,
        subtotalCop: 10000n,
      });
      expect(result.id).toBe('item-1');
    });
  });

  describe('updateCartItemQuantity', () => {
    it('actualiza cantidad del item', async () => {
      (prisma.cartItem.update as jest.Mock).mockResolvedValue({});
      await adapter.updateCartItemQuantity('item-1', 3, 30000n);
      expect(prisma.cartItem.update).toHaveBeenCalled();
    });
  });

  describe('deleteCartItem', () => {
    it('elimina item del carrito', async () => {
      (prisma.cartItem.delete as jest.Mock).mockResolvedValue({});
      await adapter.deleteCartItem('item-1');
      expect(prisma.cartItem.delete).toHaveBeenCalled();
    });
  });

  describe('closeCart', () => {
    it('cierra carrito activo', async () => {
      (prisma.cart.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await adapter.closeCart('s1');
      expect(prisma.cart.updateMany).toHaveBeenCalled();
    });
  });

  describe('touchSession', () => {
    it('actualiza actividad de la sesión', async () => {
      (prisma.session.update as jest.Mock).mockResolvedValue({});
      const now = new Date();
      await adapter.touchSession('s1', now);
      expect(prisma.session.update).toHaveBeenCalled();
    });
  });
});
