import { PrismaWebhookEventRepositoryAdapter } from './prisma-webhook-event-repository.adapter';

function buildMockPrisma() {
  return {
    paymentWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('PrismaWebhookEventRepositoryAdapter', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let adapter: PrismaWebhookEventRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    adapter = new PrismaWebhookEventRepositoryAdapter(prisma as any);
  });

  describe('findByProviderAndEventId', () => {
    it('retorna evento existente', async () => {
      (prisma.paymentWebhookEvent.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1',
        provider: 'WOMPI',
        providerEventId: 'evt-1',
        eventType: 'payment.updated',
        payload: { status: 'approved' },
        status: 'RECEIVED',
        receivedAt: new Date(),
        processedAt: null,
      });
      const result = await adapter.findByProviderAndEventId('WOMPI', 'evt-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('e1');
    });

    it('retorna null cuando no existe', async () => {
      (prisma.paymentWebhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await adapter.findByProviderAndEventId('WOMPI', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('guarda evento exitosamente', async () => {
      (prisma.paymentWebhookEvent.create as jest.Mock).mockResolvedValue({
        id: 'e1',
        provider: 'WOMPI',
        providerEventId: 'evt-1',
        eventType: 'payment.updated',
        payload: { status: 'approved' },
        status: 'RECEIVED',
        receivedAt: new Date(),
        processedAt: null,
      });
      const result = await adapter.save({
        provider: 'WOMPI',
        providerEventId: 'evt-1',
        eventType: 'payment.updated',
        payload: { status: 'approved' },
        status: 'RECEIVED',
      });
      expect(result.id).toBe('e1');
    });
  });

  describe('updateStatus', () => {
    it('actualiza estado del evento', async () => {
      (prisma.paymentWebhookEvent.update as jest.Mock).mockResolvedValue({});
      await adapter.updateStatus('e1', 'PROCESSED');
      expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          status: 'PROCESSED',
          processedAt: expect.any(Date),
        },
      });
    });

    it('no establece processedAt para DUPLICATE', async () => {
      (prisma.paymentWebhookEvent.update as jest.Mock).mockResolvedValue({});
      await adapter.updateStatus('e1', 'DUPLICATE');
      expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          status: 'DUPLICATE',
          processedAt: undefined,
        },
      });
    });

    it('usa processedAt proporcionado cuando se especifica', async () => {
      const customDate = new Date('2026-01-01');
      (prisma.paymentWebhookEvent.update as jest.Mock).mockResolvedValue({});
      await adapter.updateStatus('e1', 'PROCESSED', customDate);
      expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          status: 'PROCESSED',
          processedAt: customDate,
        },
      });
    });
  });
});
