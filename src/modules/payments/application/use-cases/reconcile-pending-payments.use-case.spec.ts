import { ReconcilePendingPaymentsUseCaseImpl } from './reconcile-pending-payments.use-case';
import { PaymentReconciliationRepositoryPort } from '../../domain/ports/payment-reconciliation.port';
import { PendingPaymentLookupResult } from '../../domain/ports/payment-reconciliation.port';
import { PaymentProviderSelector } from '../../domain/ports/payment-provider-selector';
import { PaymentProviderPort } from '../../domain/ports/payment-provider.port';
import { FakePaymentProviderAdapter } from '../../infrastructure/adapters/fake-payment-provider.adapter';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ReconcilePendingPaymentsUseCase (MSF-TEST-001)', () => {
  let useCase: ReconcilePendingPaymentsUseCaseImpl;
  let mockRepository: jest.Mocked<PaymentReconciliationRepositoryPort>;
  let fakeProvider: FakePaymentProviderAdapter;

  const NOW = new Date('2026-08-17T12:00:00.000Z');

  function makePendingPayment(
    overrides: Partial<PendingPaymentLookupResult> = {},
  ): PendingPaymentLookupResult {
    return {
      id: 'pay-001',
      orderId: 'ord-001',
      cartId: 'cart-001',
      provider: 'WOMPI',
      providerReference: 'wompi-ref-001',
      status: 'PENDING',
      amountCop: 50000n,
      createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
      ...overrides,
    };
  }

  function buildUseCase(
    providerStatus: 'APPROVED' | 'DECLINED' | 'ERROR' | 'EXPIRED' | 'PENDING',
  ): ReconcilePendingPaymentsUseCaseImpl {
    fakeProvider = new FakePaymentProviderAdapter('WOMPI');
    fakeProvider.onQueryPaymentStatus(async () => ({ status: providerStatus }));
    const selector = new PaymentProviderSelector(
      fakeProvider as unknown as PaymentProviderPort,
    );
    return new ReconcilePendingPaymentsUseCaseImpl(mockRepository, selector);
  }

  function buildUseCaseWithProvider(
    provider: FakePaymentProviderAdapter,
  ): ReconcilePendingPaymentsUseCaseImpl {
    const selector = new PaymentProviderSelector(
      provider as unknown as PaymentProviderPort,
    );
    return new ReconcilePendingPaymentsUseCaseImpl(mockRepository, selector);
  }

  beforeEach(() => {
    mockRepository = {
      findPendingPayments: jest.fn(),
      transitionPaymentStatus: jest.fn(),
      findCheckoutPendingHolds: jest.fn(),
      consumeHold: jest.fn(),
      createRefundPending: jest.fn(),
      writeOutboxEvent: jest.fn(),
    };
  });

  describe('batch vacío', () => {
    it('retorna selected=0 cuando no hay pagos pendientes', async () => {
      useCase = buildUseCase('PENDING');
      mockRepository.findPendingPayments.mockResolvedValue([]);
      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ selected: 0, reconciled: 0, pending: 0, expired: 0 });
      }
    });
  });

  describe('expiración por edad (>24h)', () => {
    it('expira pago con más de 24 horas sin consultar provider', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment({
        createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
      });
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expired).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'EXPIRED',
        orderStatus: 'PAYMENT_EXPIRED',
      });
      expect(mockRepository.writeOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PAYMENT_EXPIRED' }),
      );
      // No se debe consultar al provider si el pago ya expiró por tiempo
      expect(fakeProvider.queryPaymentStatusCalls).toHaveLength(0);
    });
  });

  describe('provider retorna PENDING', () => {
    it('no transiciona cuando provider retorna PENDING', async () => {
      useCase = buildUseCase('PENDING');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pending).toBe(1);
        expect(result.value.reconciled).toBe(0);
      }
      expect(mockRepository.transitionPaymentStatus).not.toHaveBeenCalled();
      expect(fakeProvider.queryPaymentStatusCalls).toEqual(['wompi-ref-001']);
    });
  });

  describe('provider retorna APPROVED con holds', () => {
    it('consume holds y transiciona a APPROVED/PAID', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);
      mockRepository.findCheckoutPendingHolds.mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockRepository.consumeHold.mockResolvedValue(undefined);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.consumeHold).toHaveBeenCalledWith({
        reservationId: 'res-1',
        productId: 'prod-1',
        quantity: 2,
      });
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'APPROVED',
        orderStatus: 'PAID',
      });
      expect(mockRepository.writeOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PAYMENT_APPROVED' }),
      );
    });

    it('consume múltiples holds en orden', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);
      mockRepository.findCheckoutPendingHolds.mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-A', quantity: 1 },
        { reservationId: 'res-2', productId: 'prod-B', quantity: 3 },
      ]);
      mockRepository.consumeHold.mockResolvedValue(undefined);

      await useCase.execute(NOW);
      expect(mockRepository.consumeHold).toHaveBeenCalledTimes(2);
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: 'APPROVED', orderStatus: 'PAID' }),
      );
    });
  });

  describe('provider retorna APPROVED sin holds (refund automático)', () => {
    it('crea refund cuando no hay holds CHECKOUT_PENDING', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);
      mockRepository.findCheckoutPendingHolds.mockResolvedValue([]);
      mockRepository.createRefundPending.mockResolvedValue('refund-1');

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.createRefundPending).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        amountCop: 50000n,
        idempotencyKey: 'refund:pay-001:50000',
      });
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'APPROVED',
        orderStatus: 'PAYMENT_REFUND_PENDING',
      });
      expect(mockRepository.writeOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PAYMENT_REFUND_PENDING',
          payload: expect.objectContaining({ reason: 'HOLD_NOT_CONSUMABLE' }),
        }),
      );
    });
  });

  describe('provider retorna APPROVED pero consumeHold falla', () => {
    it('crea refund cuando falla el consumo de holds', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);
      mockRepository.findCheckoutPendingHolds.mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockRepository.consumeHold.mockRejectedValue(new Error('Stock conflict'));
      mockRepository.createRefundPending.mockResolvedValue('refund-1');

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.createRefundPending).toHaveBeenCalled();
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({ orderStatus: 'PAYMENT_REFUND_PENDING' }),
      );
    });
  });

  describe('provider retorna DECLINED', () => {
    it('transiciona a PAYMENT_FAILED con paymentStatus DECLINED', async () => {
      useCase = buildUseCase('DECLINED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'DECLINED',
        orderStatus: 'PAYMENT_FAILED',
      });
      expect(mockRepository.writeOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PAYMENT_PAYMENT_FAILED' }),
      );
    });
  });

  describe('provider retorna ERROR', () => {
    it('transiciona a PAYMENT_FAILED con paymentStatus DECLINED', async () => {
      useCase = buildUseCase('ERROR');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'DECLINED',
        orderStatus: 'PAYMENT_FAILED',
      });
    });
  });

  describe('provider retorna EXPIRED', () => {
    it('transiciona a PAYMENT_EXPIRED con paymentStatus EXPIRED', async () => {
      useCase = buildUseCase('EXPIRED');
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reconciled).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        orderId: 'ord-001',
        paymentStatus: 'EXPIRED',
        orderStatus: 'PAYMENT_EXPIRED',
      });
      expect(mockRepository.writeOutboxEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PAYMENT_PAYMENT_EXPIRED' }),
      );
    });
  });

  describe('provider falla (error técnico)', () => {
    it('mantiene pendiente cuando providerReference es null', async () => {
      useCase = buildUseCase('APPROVED');
      const payment = makePendingPayment({ providerReference: null });
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pending).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).not.toHaveBeenCalled();
    });

    it('mantiene pendiente cuando selector lanza error', async () => {
      const brokenSelector = { resolve: jest.fn().mockImplementation(() => { throw new Error('Not configured'); }) } as any;
      useCase = new ReconcilePendingPaymentsUseCaseImpl(mockRepository, brokenSelector);
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pending).toBe(1);
      }
      expect(mockRepository.transitionPaymentStatus).not.toHaveBeenCalled();
    });

    it('mantiene pendiente cuando queryPaymentStatus lanza error', async () => {
      const errorProvider = new FakePaymentProviderAdapter('WOMPI');
      errorProvider.onQueryPaymentStatus(async () => { throw new Error('Timeout'); });
      useCase = buildUseCaseWithProvider(errorProvider);
      const payment = makePendingPayment();
      mockRepository.findPendingPayments.mockResolvedValue([payment]);

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pending).toBe(1);
      }
    });
  });

  describe('múltiples pagos', () => {
    it('procesa batch mixto: reconciled + pending + expired', async () => {
      const approved = buildUseCase('APPROVED');
      // Reusamos el mismo repositorio para el batch mixto
      const payment1 = makePendingPayment({
        id: 'pay-001',
        providerReference: 'ref-1',
      });
      const payment2 = makePendingPayment({
        id: 'pay-002',
        providerReference: 'ref-2',
      });
      const payment3 = makePendingPayment({
        id: 'pay-003',
        providerReference: 'ref-3',
        createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
      });

      mockRepository.findPendingPayments.mockResolvedValue([payment1, payment2, payment3]);
      // Provider retorna APPROVED para todos los consultados
      mockRepository.findCheckoutPendingHolds.mockResolvedValue([
        { reservationId: 'res-1', productId: 'prod-1', quantity: 1 },
      ]);
      mockRepository.consumeHold.mockResolvedValue(undefined);

      const result = await approved.execute(NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.selected).toBe(3);
        expect(result.value.reconciled).toBe(2);
        expect(result.value.expired).toBe(1);
      }
    });
  });

  describe('error técnico en batch', () => {
    it('retorna TECHNICAL_DEPENDENCY_FAILURE si el repositorio falla', async () => {
      useCase = buildUseCase('PENDING');
      mockRepository.findPendingPayments.mockRejectedValue(new Error('DB fail'));

      const result = await useCase.execute(NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
    });
  });
});
