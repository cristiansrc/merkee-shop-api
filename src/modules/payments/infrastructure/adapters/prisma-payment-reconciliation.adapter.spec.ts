import { PrismaPaymentReconciliationAdapter } from './prisma-payment-reconciliation.adapter';

function buildMockPrisma() {
  return {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    stockReservation: {
      findMany: jest.fn(),
    },
    paymentRefund: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    order: {
      update: jest.fn(),
    },
  };
}

describe('PrismaPaymentReconciliationAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaPaymentReconciliationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaPaymentReconciliationAdapter(prisma as any);
  });

  describe('findPendingPayments', () => {
    it('retorna pagos pendientes en la ventana', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          id: 'pay-1',
          order_id: 'ord-1',
          cart_id: 'cart-1',
          provider: 'WOMPI',
          provider_reference: 'wompi-ref',
          status: 'PENDING',
          amount_cop: 50000n,
          created_at: new Date('2026-08-17T11:50:00Z'),
        },
      ]);
      const result = await adapter.findPendingPayments({
        now: new Date('2026-08-17T12:00:00Z'),
        minAgeMs: 5 * 60 * 1000,
        maxAgeMs: 24 * 60 * 60 * 1000,
        limit: 10,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pay-1');
    });

    it('retorna array vacío cuando no hay pagos', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await adapter.findPendingPayments({
        now: new Date(),
        minAgeMs: 5 * 60 * 1000,
        maxAgeMs: 24 * 60 * 60 * 1000,
        limit: 10,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('transitionPaymentStatus', () => {
    it('actualiza estado del pago y la orden', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          order: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      await adapter.transitionPaymentStatus({
        paymentId: 'pay-1',
        orderId: 'ord-1',
        paymentStatus: 'APPROVED',
        orderStatus: 'PAID',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('findCheckoutPendingHolds', () => {
    it('retorna holds CHECKOUT_PENDING del carrito', async () => {
      (prisma.stockReservation.findMany as jest.Mock).mockResolvedValue([
        { id: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      const result = await adapter.findCheckoutPendingHolds('cart-1');
      expect(result).toHaveLength(1);
      expect(result[0].reservationId).toBe('res-1');
    });

    it('retorna array vacío cuando no hay holds', async () => {
      (prisma.stockReservation.findMany as jest.Mock).mockResolvedValue([]);
      const result = await adapter.findCheckoutPendingHolds('cart-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('consumeHold', () => {
    it('consume hold exitosamente', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'prod-1', stock_on_hand: 10, stock_reserved: 5 }]),
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          stockReservation: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      await adapter.consumeHold({
        reservationId: 'res-1',
        productId: 'prod-1',
        quantity: 2,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lanza error cuando el producto no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          $executeRaw: jest.fn(),
          stockReservation: { update: jest.fn() },
        };
        return fn(tx);
      });
      await expect(
        adapter.consumeHold({ reservationId: 'res-1', productId: 'nonexistent', quantity: 1 }),
      ).rejects.toThrow('PAYMENT_HOLD_NOT_CONSUMABLE');
    });

    it('lanza error cuando stock_on_hand < quantity', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'prod-1', stock_on_hand: 1, stock_reserved: 5 }]),
          $executeRaw: jest.fn(),
          stockReservation: { update: jest.fn() },
        };
        return fn(tx);
      });
      await expect(
        adapter.consumeHold({ reservationId: 'res-1', productId: 'prod-1', quantity: 5 }),
      ).rejects.toThrow('PAYMENT_HOLD_NOT_CONSUMABLE');
    });
  });

  describe('createRefundPending', () => {
    it('crea refund cuando no existe', async () => {
      (prisma.paymentRefund.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.paymentRefund.create as jest.Mock).mockResolvedValue({ id: 'refund-1' });
      const result = await adapter.createRefundPending({
        paymentId: 'pay-1',
        amountCop: 50000n,
        idempotencyKey: 'key-1',
      });
      expect(result).toBe('refund-1');
    });

    it('retorna refund existente cuando ya existe', async () => {
      (prisma.paymentRefund.findUnique as jest.Mock).mockResolvedValue({ id: 'refund-existing' });
      const result = await adapter.createRefundPending({
        paymentId: 'pay-1',
        amountCop: 50000n,
        idempotencyKey: 'key-1',
      });
      expect(result).toBe('refund-existing');
    });
  });

  describe('writeOutboxEvent', () => {
    it('crea evento de outbox', async () => {
      (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({});
      await adapter.writeOutboxEvent({
        eventType: 'PAYMENT_APPROVED',
        aggregateType: 'Payment',
        aggregateId: 'pay-1',
        payload: { paymentId: 'pay-1' },
      });
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });
  });
});
