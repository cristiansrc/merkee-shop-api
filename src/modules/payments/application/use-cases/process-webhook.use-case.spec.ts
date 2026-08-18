import { ProcessWebhookUseCaseImpl } from './process-webhook.use-case';
import { ProcessWebhookCommand } from '../../domain/ports/process-webhook.port';
import {
  ProcessWebhookUnitOfWorkPort,
  WebhookTransactionContext,
} from '../../domain/ports/process-webhook-unit-of-work.port';

describe('ProcessWebhookUseCaseImpl (completo)', () => {
  let useCase: ProcessWebhookUseCaseImpl;
  let mockUnitOfWork: ProcessWebhookUnitOfWorkPort;
  let mockCtx: WebhookTransactionContext;

  beforeEach(() => {
    mockCtx = createMockTransactionContext();
    mockUnitOfWork = {
      run: jest.fn(async (work) => work(mockCtx)),
    };
    useCase = new ProcessWebhookUseCaseImpl(mockUnitOfWork);
  });

  describe('execute', () => {
    it('persiste evento y retorna accepted para status desconocido', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'PENDING' } },
      });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('maneja APPROVED con holds consumibles', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockCtx.holdConsumer.consumeHold = jest.fn().mockResolvedValue(undefined);
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.holdConsumer.consumeHold).toHaveBeenCalledTimes(1);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-123', 'APPROVED');
      expect(mockCtx.orderUpdater.updateStatus).toHaveBeenCalledWith('order-123', 'PAID');
    });

    it('crea refund cuando no hay holds CHECKOUT_PENDING', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([]);
      mockCtx.refundCreator.createRefundPending = jest.fn().mockResolvedValue('refund-123');
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.refundCreator.createRefundPending).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay-123', amountCop: 50000n }),
      );
      expect(mockCtx.orderUpdater.updateStatus).toHaveBeenCalledWith('order-123', 'PAYMENT_REFUND_PENDING');
    });

    it('crea refund cuando hold consumption falla', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockCtx.holdConsumer.consumeHold = jest.fn().mockRejectedValue(new Error('HOLD_FAIL'));
      mockCtx.refundCreator.createRefundPending = jest.fn().mockResolvedValue('refund-123');
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.refundCreator.createRefundPending).toHaveBeenCalled();
      expect(mockCtx.orderUpdater.updateStatus).toHaveBeenCalledWith('order-123', 'PAYMENT_REFUND_PENDING');
    });

    it('maneja DECLINED event', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'DECLINED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-123', 'DECLINED');
      expect(mockCtx.orderUpdater.updateStatus).toHaveBeenCalledWith('order-123', 'PAYMENT_FAILED');
    });

    it('maneja EXPIRED event', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'EXPIRED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-123', 'EXPIRED');
      expect(mockCtx.orderUpdater.updateStatus).toHaveBeenCalledWith('order-123', 'PAYMENT_EXPIRED');
    });

    it('no reprocesa pagos en estado terminal', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'APPROVED', amountCop: 50000n, providerReference: 'pay-123',
      });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).not.toHaveBeenCalled();
    });

    it('maneja MercadoPago approved event', async () => {
      const command = createMercadoPagoCommand('payment.created', {
        data: { id: 'pay-mp-123', status: 'approved', order_id: 'order-123' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 75000n, providerReference: 'pay-mp-123',
      });
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 3 },
      ]);
      mockCtx.holdConsumer.consumeHold = jest.fn().mockResolvedValue(undefined);
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.holdConsumer.consumeHold).toHaveBeenCalledTimes(1);
    });

    it('maneja evento duplicado (save throws UNIQUE violation)', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.webhookEventSaver.save = jest.fn().mockRejectedValue(new Error('Unique constraint'));
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('no decrementa stock doble para eventos concurrentes', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      let paymentStatus = 'PENDING';
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockImplementation(
        () => Promise.resolve({
          id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
          provider: 'WOMPI', status: paymentStatus, amountCop: 50000n, providerReference: 'pay-123',
        }),
      );
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockCtx.holdConsumer.consumeHold = jest.fn().mockImplementation(() => {
        paymentStatus = 'APPROVED';
        return Promise.resolve();
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      await useCase.execute(command);
      expect(mockCtx.holdConsumer.consumeHold).toHaveBeenCalledTimes(1);
      await useCase.execute(command);
      expect(mockCtx.holdConsumer.consumeHold).toHaveBeenCalledTimes(1);
    });

    it('retorna accepted cuando providerPaymentId es null (sin data)', async () => {
      const command = createWompiCommand('transaction.updated', { data: undefined });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('retorna accepted cuando pago no encontrado', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-notfound', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue(null);
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('busca por orderId cuando provider_reference no encuentra', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED', reference: 'order-by-ref' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-by-ref', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: null,
      });
      mockCtx.holdFinder.findCheckoutPendingHolds = jest.fn().mockResolvedValue([]);
      mockCtx.refundCreator.createRefundPending = jest.fn().mockResolvedValue('refund-1');
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentFinder.findByOrderIdForUpdate).toHaveBeenCalledWith('order-by-ref');
    });

    it('maneja MercadoPago con external_reference', async () => {
      const command = createMercadoPagoCommand('payment.created', {
        data: { id: 'pay-mp-ext', status: 'rejected', external_reference: 'order-ext-ref' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-ext', orderId: 'order-ext-ref', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: null,
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-mp-ext', 'DECLINED');
    });

    it('maneja MercadoPago cancelled como DECLINED', async () => {
      const command = createMercadoPagoCommand('payment.created', {
        data: { id: 'pay-mp-cancel', status: 'cancelled' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-cancel', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-mp-cancel',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-mp-cancel', 'DECLINED');
    });

    it('maneja MercadoPago in_process como PENDING', async () => {
      const command = createMercadoPagoCommand('payment.updated', {
        data: { id: 'pay-mp-pending', status: 'in_process' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-pending', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-mp-pending',
      });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).not.toHaveBeenCalled();
    });

    it('maneja MercadoPago in_mediation como PENDING', async () => {
      const command = createMercadoPagoCommand('payment.updated', {
        data: { id: 'pay-mp-mediation', status: 'in_mediation' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-mediation', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-mp-mediation',
      });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).not.toHaveBeenCalled();
    });

    it('maneja MercadoPago refunded como status no reconocido', async () => {
      const command = createMercadoPagoCommand('payment.updated', {
        data: { id: 'pay-mp-refunded', status: 'refunded' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-refunded', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-mp-refunded',
      });
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      // refunded no es APPROVED/DECLINED/ERROR/EXPIRED → accepted sin transición
      expect(mockCtx.paymentUpdater.updateStatus).not.toHaveBeenCalled();
    });

    it('maneja MercadoPago charged_back como DECLINED', async () => {
      const command = createMercadoPagoCommand('payment.updated', {
        data: { id: 'pay-mp-chargedback', status: 'charged_back' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-mp-chargedback', orderId: 'order-123', cartId: 'cart-123',
        provider: 'MERCADO_PAGO', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-mp-chargedback',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-mp-chargedback', 'DECLINED');
    });

    it('maneja Wompi VOIDED como DECLINED', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-wompi-voided', status: 'VOIDED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-wompi-voided', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-wompi-voided',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-wompi-voided', 'DECLINED');
    });

    it('maneja Wompi ERROR status', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-wompi-error', status: 'ERROR' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-wompi-error', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-wompi-error',
      });
      mockCtx.paymentUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.orderUpdater.updateStatus = jest.fn().mockResolvedValue(undefined);
      mockCtx.outboxWriter.write = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).toHaveBeenCalledWith('pay-wompi-error', 'DECLINED');
    });

    it('maneja Wompi data.id en lugar de data.transaction.id', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { id: 'pay-wompi-dataid', status: 'APPROVED' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue(null);
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('maneja Wompi data.status en lugar de data.transaction.status', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { id: 'pay-wompi-datastatus', status: 'DECLINED' },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue(null);
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('maneja MercadoPago sin data (data undefined)', async () => {
      const command = createMercadoPagoCommand('payment.created', {});
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('maneja Wompi con data vacío', async () => {
      const command = createWompiCommand('transaction.updated', { data: {} });
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
    });

    it('maneja payment not found con orderId via data.transaction.reference', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-wompi-ref', status: 'APPROVED', reference: 'order-ref-123' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue(null);
      mockCtx.paymentFinder.findByOrderIdForUpdate = jest.fn().mockResolvedValue(null);
      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.outcome).toBe('accepted');
      }
    });

    it('maneja APPROVED con cartId null (no hold consumption)', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'APPROVED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: null,
        provider: 'WOMPI', status: 'PENDING', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.webhookEventSaver.updateStatus).toHaveBeenCalledWith('event-123', 'FAILED');
    });

    it('maneja terminal DECLINED para pago ya terminal (REFUNDED)', async () => {
      const command = createWompiCommand('transaction.updated', {
        data: { transaction: { id: 'pay-123', status: 'DECLINED' } },
      });
      mockCtx.paymentFinder.findByProviderReferenceForUpdate = jest.fn().mockResolvedValue({
        id: 'pay-123', orderId: 'order-123', cartId: 'cart-123',
        provider: 'WOMPI', status: 'REFUNDED', amountCop: 50000n, providerReference: 'pay-123',
      });
      mockCtx.webhookEventSaver.updateStatus = jest.fn().mockResolvedValue(undefined);

      const result = await useCase.execute(command);
      expect(result.ok).toBe(true);
      expect(mockCtx.paymentUpdater.updateStatus).not.toHaveBeenCalled();
    });
  });
});

function createWompiCommand(
  eventType: string,
  payload: Record<string, unknown>,
): ProcessWebhookCommand {
  return {
    provider: 'WOMPI',
    providerEventId: `wompi-event-${Date.now()}-${Math.random()}`,
    eventType,
    payload,
  };
}

function createMercadoPagoCommand(
  eventType: string,
  payload: Record<string, unknown>,
): ProcessWebhookCommand {
  return {
    provider: 'MERCADO_PAGO',
    providerEventId: `mp-event-${Date.now()}-${Math.random()}`,
    eventType,
    payload,
  };
}

function createMockTransactionContext(): WebhookTransactionContext {
  return {
    webhookEventSaver: {
      save: jest.fn().mockResolvedValue('event-123'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    },
    paymentFinder: {
      findByIdForUpdate: jest.fn().mockResolvedValue(null),
      findByOrderIdForUpdate: jest.fn().mockResolvedValue(null),
      findByProviderReferenceForUpdate: jest.fn().mockResolvedValue(null),
    },
    holdFinder: {
      findCheckoutPendingHolds: jest.fn().mockResolvedValue([]),
    },
    holdConsumer: {
      consumeHold: jest.fn().mockResolvedValue(undefined),
    },
    refundCreator: {
      createRefundPending: jest.fn().mockResolvedValue('refund-123'),
    },
    paymentUpdater: {
      updateStatus: jest.fn().mockResolvedValue(undefined),
    },
    orderUpdater: {
      updateStatus: jest.fn().mockResolvedValue(undefined),
    },
    outboxWriter: {
      write: jest.fn().mockResolvedValue(undefined),
    },
  };
}
