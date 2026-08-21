import { PrismaCheckoutUnitOfWorkAdapter } from './checkout-unit-of-work.adapter';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
  };
}

function buildMockStockReservation() {
  return {
    convertToCheckoutPending: jest.fn(),
  };
}

function buildMockCartRepo() {
  return {
    findCartWithItemsByCartId: jest.fn(),
  };
}

describe('PrismaCheckoutUnitOfWorkAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let stockReservation: ReturnType<typeof buildMockStockReservation>;
  let cartRepo: ReturnType<typeof buildMockCartRepo>;
  let adapter: PrismaCheckoutUnitOfWorkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    stockReservation = buildMockStockReservation();
    cartRepo = buildMockCartRepo();
    adapter = new PrismaCheckoutUnitOfWorkAdapter(
      prisma as any,
      stockReservation as any,
      cartRepo as any,
    );
  });

  it('ejecuta work dentro de transacción y retorna ok', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        stockReservation: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        order: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'ord-1',
            orderNumber: 'ORD-001',
            items: [],
          }),
        },
        payment: {
          create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
        },
        idempotencyRecord: {
          create: jest.fn(),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async (ctx) => {
      expect(ctx.reservationConverter).toBeDefined();
      expect(ctx.orderCreator).toBeDefined();
      expect(ctx.idempotency).toBeDefined();
      return { ok: true, value: 'checkout-success' } as any;
    });

    expect(result.ok).toBe(true);
  });

  it('retorna error técnico cuando la transacción falla', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB fail'));

    const result = await adapter.run(async () => ({ ok: true, value: 'never' }) as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });

  it('retorna orderAlreadyExists cuando la orden ya existe', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('ORDER_ALREADY_EXISTS'),
    );

    const result = await adapter.run(async () => ({ ok: true, value: 'never' }) as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.ORDER_ALREADY_EXISTS);
    }
  });

  describe('reservationConverter', () => {
    it('convertActiveToCheckoutPending convierte reservas ACTIVE', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'res-1', status: 'ACTIVE' },
            ]),
            update: jest.fn(),
          },
          order: { findUnique: jest.fn(), create: jest.fn() },
          payment: { create: jest.fn() },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.reservationConverter.convertActiveToCheckoutPending('cart-1');
        return { ok: true, value: undefined } as any;
      });
    });
  });

  describe('orderCreator', () => {
    it('createOrderAndPayment crea orden y pago', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          order: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'ord-1',
              orderNumber: 'ORD-001',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              items: [],
            }),
          },
          payment: {
            create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
          },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.orderCreator.createOrderAndPayment({
          cartId: 'cart-1',
          userId: 'u1',
          itemsSubtotalCop: 10000n,
          deliveryFeeCop: 5000n,
          ivaCop: 1900n,
          taxRateBasisPoints: 1900,
          totalCop: 16900n,
          deliveryRecipientName: 'Test',
          deliveryLine1: 'Calle 1',
          deliveryCity: 'Bogotá',
          deliveryPhone: '300',
          provider: 'WOMPI',
          providerReference: 'wompi-tx-1',
          paymentIdempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
          items: [
            {
              productId: 'p1',
              productName: 'Product 1',
              unit: 'kg',
              unitPriceCop: 10000n,
              quantity: 1,
              subtotalCop: 10000n,
            },
          ],
        });
        expect(result.orderId).toBe('ord-1');
        return { ok: true, value: result } as any;
      });
    });

    it('createOrderAndPayment lanza error cuando la orden ya existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          order: {
            findUnique: jest.fn().mockResolvedValue({ id: 'existing-order' }),
            create: jest.fn(),
          },
          payment: { create: jest.fn() },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await expect(
          ctx.orderCreator.createOrderAndPayment({
            cartId: 'cart-1',
            userId: 'u1',
            itemsSubtotalCop: 10000n,
            deliveryFeeCop: 5000n,
            ivaCop: 1900n,
            taxRateBasisPoints: 1900,
            totalCop: 16900n,
            deliveryRecipientName: 'Test',
            deliveryLine1: 'Calle 1',
            deliveryCity: 'Bogotá',
            deliveryPhone: '300',
            provider: 'WOMPI',
            providerReference: null,
            paymentIdempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
            items: [],
          }),
        ).rejects.toThrow('ORDER_ALREADY_EXISTS');
        return { ok: true, value: undefined } as any;
      });
    });
  });

  describe('idempotency', () => {
    it('findForUpdate retorna registro existente', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          order: { findUnique: jest.fn(), create: jest.fn() },
          payment: { create: jest.fn() },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'r1',
              scope: 'checkout',
              idempotency_key: 'key-1',
              body_hash: 'hash1',
              response_json: { orderId: 'ord-1' },
            },
          ]),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.idempotency.findForUpdate('checkout', 'key-1');
        expect(result).not.toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('findForUpdate retorna null cuando no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          order: { findUnique: jest.fn(), create: jest.fn() },
          payment: { create: jest.fn() },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.idempotency.findForUpdate('checkout', 'key-1');
        expect(result).toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('save guarda registro de idempotencia', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          order: { findUnique: jest.fn(), create: jest.fn() },
          payment: { create: jest.fn() },
          idempotencyRecord: { create: jest.fn() },
          $queryRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.idempotency.save({
          scope: 'checkout',
          idempotencyKey: 'key-1',
          bodyHash: 'hash1',
          responseJson: { orderId: 'ord-1' },
        });
        return { ok: true, value: undefined } as any;
      });
    });
  });
});
