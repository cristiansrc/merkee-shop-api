import { PrismaProcessWebhookUnitOfWorkAdapter } from './prisma-process-webhook-uow.adapter';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
  };
}

describe('PrismaProcessWebhookUnitOfWorkAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaProcessWebhookUnitOfWorkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaProcessWebhookUnitOfWorkAdapter(prisma as any);
  });

  it('ejecuta work dentro de transacción y retorna ok', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const mockTx = {
        paymentWebhookEvent: {
          create: jest.fn().mockResolvedValue({ id: 'e1' }),
          update: jest.fn(),
        },
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'pay-1',
            order_id: 'ord-1',
            cart_id: 'cart-1',
            provider: 'WOMPI',
            status: 'PENDING',
            amount_cop: 50000n,
            provider_reference: 'ref-1',
          },
        ]),
        stockReservation: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        product: { update: jest.fn() },
        paymentRefund: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
        },
        payment: { update: jest.fn() },
        order: { update: jest.fn() },
        outboxEvent: { create: jest.fn() },
        $executeRaw: jest.fn(),
      };
      return fn(mockTx);
    });

    const result = await adapter.run(async (ctx) => {
      expect(ctx.webhookEventSaver).toBeDefined();
      expect(ctx.paymentFinder).toBeDefined();
      expect(ctx.holdFinder).toBeDefined();
      expect(ctx.holdConsumer).toBeDefined();
      expect(ctx.refundCreator).toBeDefined();
      expect(ctx.paymentUpdater).toBeDefined();
      expect(ctx.orderUpdater).toBeDefined();
      expect(ctx.outboxWriter).toBeDefined();
      return { ok: true, value: 'success' } as any;
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

  it('retorna paymentHoldNotConsumable cuando el hold no es consumible', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('PAYMENT_HOLD_NOT_CONSUMABLE'),
    );

    const result = await adapter.run(async () => ({ ok: true, value: 'never' }) as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.PAYMENT_HOLD_NOT_CONSUMABLE);
    }
  });

  describe('webhookEventSaver', () => {
    it('save crea evento y retorna id', async () => {
      let capturedCtx: any;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: {
            create: jest.fn().mockResolvedValue({ id: 'e1' }),
            update: jest.fn(),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        const result = await fn(mockTx);
        capturedCtx = mockTx;
        return result;
      });

      await adapter.run(async (ctx) => {
        const id = await ctx.webhookEventSaver.save({
          provider: 'WOMPI',
          providerEventId: 'evt-1',
          eventType: 'payment.updated',
          payload: { status: 'approved' },
        });
        expect(id).toBe('e1');
        return { ok: true, value: id } as any;
      });
    });

    it('updateStatus actualiza el estado del evento', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: {
            create: jest.fn().mockResolvedValue({ id: 'e1' }),
            update: jest.fn(),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.webhookEventSaver.updateStatus('e1', 'PROCESSED');
        return { ok: true, value: undefined } as any;
      });
    });
  });

  describe('paymentFinder', () => {
    it('findByIdForUpdate retorna pago encontrado', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'pay-1',
              order_id: 'ord-1',
              cart_id: 'cart-1',
              provider: 'WOMPI',
              status: 'PENDING',
              amount_cop: 50000n,
              provider_reference: 'ref-1',
            },
          ]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByIdForUpdate('pay-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('pay-1');
        return { ok: true, value: result } as any;
      });
    });

    it('findByIdForUpdate retorna null cuando no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByIdForUpdate('nonexistent');
        expect(result).toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('findByOrderIdForUpdate retorna pago por orderId', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'pay-1',
              order_id: 'ord-1',
              cart_id: 'cart-1',
              provider: 'WOMPI',
              status: 'PENDING',
              amount_cop: 50000n,
              provider_reference: null,
            },
          ]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByOrderIdForUpdate('ord-1');
        expect(result).not.toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('findByOrderIdForUpdate retorna null cuando no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByOrderIdForUpdate('nonexistent');
        expect(result).toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('findByProviderReferenceForUpdate retorna pago por provider reference', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'pay-1',
              order_id: 'ord-1',
              cart_id: 'cart-1',
              provider: 'WOMPI',
              status: 'PENDING',
              amount_cop: 50000n,
              provider_reference: 'wompi-ref',
            },
          ]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByProviderReferenceForUpdate('WOMPI', 'wompi-ref');
        expect(result).not.toBeNull();
        return { ok: true, value: result } as any;
      });
    });

    it('findByProviderReferenceForUpdate retorna null cuando no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const result = await ctx.paymentFinder.findByProviderReferenceForUpdate('WOMPI', 'nonexistent');
        expect(result).toBeNull();
        return { ok: true, value: result } as any;
      });
    });
  });

  describe('holdFinder', () => {
    it('findCheckoutPendingHolds retorna holds del carrito', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'res-1', productId: 'prod-1', quantity: 2 },
            ]),
            update: jest.fn(),
          },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const holds = await ctx.holdFinder.findCheckoutPendingHolds('cart-1');
        expect(holds).toHaveLength(1);
        expect(holds[0].reservationId).toBe('res-1');
        return { ok: true, value: holds } as any;
      });
    });
  });

  describe('refundCreator', () => {
    it('createRefundPending crea refund cuando no existe', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
          },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const id = await ctx.refundCreator.createRefundPending({
          paymentId: 'pay-1',
          amountCop: 50000n,
          idempotencyKey: 'key-1',
        });
        expect(id).toBe('refund-1');
        return { ok: true, value: id } as any;
      });
    });

    it('createRefundPending retorna refund existente', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: {
            findUnique: jest.fn().mockResolvedValue({ id: 'refund-existing' }),
            create: jest.fn(),
          },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        const id = await ctx.refundCreator.createRefundPending({
          paymentId: 'pay-1',
          amountCop: 50000n,
          idempotencyKey: 'key-1',
        });
        expect(id).toBe('refund-existing');
        return { ok: true, value: id } as any;
      });
    });
  });

  describe('paymentUpdater', () => {
    it('updateStatus actualiza el estado del pago', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.paymentUpdater.updateStatus('pay-1', 'APPROVED');
        return { ok: true, value: undefined } as any;
      });
    });
  });

  describe('orderUpdater', () => {
    it('updateStatus actualiza el estado de la orden', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.orderUpdater.updateStatus('ord-1', 'PAID');
        return { ok: true, value: undefined } as any;
      });
    });
  });

  describe('outboxWriter', () => {
    it('write crea evento de outbox', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const mockTx = {
          paymentWebhookEvent: { create: jest.fn(), update: jest.fn() },
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockReservation: { findMany: jest.fn(), update: jest.fn() },
          product: { update: jest.fn() },
          paymentRefund: { findUnique: jest.fn(), create: jest.fn() },
          payment: { update: jest.fn() },
          order: { update: jest.fn() },
          outboxEvent: { create: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return fn(mockTx);
      });

      await adapter.run(async (ctx) => {
        await ctx.outboxWriter.write({
          eventType: 'PAYMENT_APPROVED',
          aggregateType: 'Payment',
          aggregateId: 'pay-1',
          payload: { paymentId: 'pay-1' },
        });
        return { ok: true, value: undefined } as any;
      });
    });
  });
});
