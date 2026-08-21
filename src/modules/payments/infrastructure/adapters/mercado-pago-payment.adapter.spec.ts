import { MercadoPagoPaymentAdapter } from './mercado-pago-payment.adapter';
import {
  PaymentProviderConfig,
  DEFAULT_PAYMENT_TIMEOUT_MS,
} from '../../domain/payment-provider-config';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeConfig(overrides?: Partial<PaymentProviderConfig>): PaymentProviderConfig {
  return {
    name: 'MERCADO_PAGO',
    baseUrl: 'https://api.mercadopago.com',
    secretKey: 'test-mp-access-token',
    timeoutMs: DEFAULT_PAYMENT_TIMEOUT_MS,
    paymentRetries: { maxRetries: 0, delaysMs: [] },
    refundRetries: { maxRetries: 0, delaysMs: [] },
    ...overrides,
  };
}

describe('MercadoPagoPaymentAdapter', () => {
  let adapter: MercadoPagoPaymentAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new MercadoPagoPaymentAdapter(makeConfig());
  });

  describe('createPayment', () => {
    it('crea pago exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 12345678,
          status: 'approved',
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-1',
        amountCop: 50000,
        idempotencyKey: 'idem-key-1',
      });

      expect(result.providerPaymentId).toBe('12345678');
      expect(result.status).toBe('APPROVED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mercadopago.com/v1/payments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-mp-access-token',
          }),
        }),
      );
    });

    it('devuelve init_point como checkoutUrl', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 12345678,
          status: 'pending',
          init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=123',
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-1',
        amountCop: 50000,
        idempotencyKey: 'idem-key-1',
      });

      expect(result.checkoutUrl).toBe('https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=123');
    });

    it('mapea status pending correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 9999,
          status: 'pending',
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-2',
        amountCop: 30000,
        idempotencyKey: 'idem-key-2',
      });

      expect(result.status).toBe('PENDING');
    });

    it('mapea status rejected como DECLINED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 8888,
          status: 'rejected',
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-3',
        amountCop: 10000,
        idempotencyKey: 'idem-key-3',
      });

      expect(result.status).toBe('DECLINED');
    });

    it('mapea status desconocido como PENDING por defecto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 7777,
          status: 'unknown_status',
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-4',
        amountCop: 10000,
        idempotencyKey: 'idem-key-4',
      });

      expect(result.status).toBe('PENDING');
    });

    it('lanza error en respuesta HTTP no exitosa', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(
        adapter.createPayment({
          orderId: 'order-1',
          amountCop: 50000,
          idempotencyKey: 'idem-key-1',
        }),
      ).rejects.toThrow();
    });
  });

  describe('queryPaymentStatus', () => {
    it('consulta estado exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 12345678,
          status: 'approved',
        }),
      });

      const result = await adapter.queryPaymentStatus('12345678');

      expect(result.status).toBe('APPROVED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mercadopago.com/v1/payments/12345678',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('mapea status rejected como DECLINED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 456789,
          status: 'rejected',
        }),
      });

      const result = await adapter.queryPaymentStatus('456789');

      expect(result.status).toBe('DECLINED');
    });

    it('mapea status cancelled como EXPIRED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 111111,
          status: 'cancelled',
        }),
      });

      const result = await adapter.queryPaymentStatus('111111');

      expect(result.status).toBe('EXPIRED');
    });

    it('mapea status in_process como PENDING', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 222222,
          status: 'in_process',
        }),
      });

      const result = await adapter.queryPaymentStatus('222222');

      expect(result.status).toBe('PENDING');
    });

    it('mapea status pending correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 333333,
          status: 'pending',
        }),
      });

      const result = await adapter.queryPaymentStatus('333333');

      expect(result.status).toBe('PENDING');
    });

    it('mapea status desconocido como PENDING por defecto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 444444,
          status: 'unknown',
        }),
      });

      const result = await adapter.queryPaymentStatus('444444');

      expect(result.status).toBe('PENDING');
    });

    it('lanza error en respuesta HTTP no exitosa', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(adapter.queryPaymentStatus('12345678')).rejects.toThrow();
    });
  });

  describe('refund', () => {
    it('crea refund exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 11111,
          status: 'approved',
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: '12345678',
        amountCop: 25000,
        idempotencyKey: 'refund-key-1',
      });

      expect(result.providerRefundId).toBe('11111');
      expect(result.status).toBe('COMPLETED');
    });

    it('mapea refund pending correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 22222,
          status: 'pending',
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: '12345678',
        amountCop: 10000,
        idempotencyKey: 'refund-key-2',
      });

      expect(result.status).toBe('PENDING');
    });

    it('mapea refund rejected como FAILED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 33333,
          status: 'rejected',
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: '12345678',
        amountCop: 10000,
        idempotencyKey: 'refund-key-3',
      });

      expect(result.status).toBe('FAILED');
    });

    it('mapea refund status desconocido como PENDING por defecto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 44444,
          status: 'unknown',
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: '12345678',
        amountCop: 10000,
        idempotencyKey: 'refund-key-4',
      });

      expect(result.status).toBe('PENDING');
    });

    it('lanza error en respuesta HTTP no exitosa', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(
        adapter.refund({
          providerPaymentId: '12345678',
          amountCop: 10000,
          idempotencyKey: 'refund-key-1',
        }),
      ).rejects.toThrow();
    });
  });

  describe('security', () => {
    it('no contiene PAN/CVV/fecha en llamadas', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, status: 'approved' }),
      });

      await adapter.createPayment({
        orderId: 'order-1',
        amountCop: 50000,
        idempotencyKey: 'idem-key-1',
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const bodyStr = JSON.stringify(body);

      expect(bodyStr).not.toMatch(/\d{13,19}/); // No PAN
      expect(bodyStr).not.toMatch(/cvv|cvc/i);
      expect(bodyStr).not.toMatch(/\d{2}\/\d{2,4}/); // No expiry
    });
  });

  describe('provider name', () => {
    it('reporta MERCADO_PAGO como provider', () => {
      expect(adapter.provider).toBe('MERCADO_PAGO');
    });
  });
});
