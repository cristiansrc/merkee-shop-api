import { WompiPaymentAdapter } from './wompi-payment.adapter';
import {
  PaymentProviderConfig,
  DEFAULT_PAYMENT_TIMEOUT_MS,
  DEFAULT_PAYMENT_RETRIES,
  DEFAULT_REFUND_RETRIES,
} from '../../domain/payment-provider-config';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeConfig(overrides?: Partial<PaymentProviderConfig>): PaymentProviderConfig {
  return {
    name: 'WOMPI',
    baseUrl: 'https://api.wompi.co',
    secretKey: 'test-wompi-secret',
    timeoutMs: DEFAULT_PAYMENT_TIMEOUT_MS,
    paymentRetries: { maxRetries: 0, delaysMs: [] },
    refundRetries: { maxRetries: 0, delaysMs: [] },
    ...overrides,
  };
}

describe('WompiPaymentAdapter', () => {
  let adapter: WompiPaymentAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new WompiPaymentAdapter(makeConfig());
  });

  describe('createPayment', () => {
    it('crea pago exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-123', status: 'APPROVED' },
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-1',
        amountCop: 50000,
        idempotencyKey: 'idem-key-1',
      });

      expect(result.providerPaymentId).toBe('wompi-tx-123');
      expect(result.status).toBe('APPROVED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.wompi.co/v1/transactions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-wompi-secret',
          }),
        }),
      );
    });

    it('mapea status PENDING correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-456', status: 'PENDING' },
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-2',
        amountCop: 30000,
        idempotencyKey: 'idem-key-2',
      });

      expect(result.status).toBe('PENDING');
    });

    it('mapea status DECLINED correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-789', status: 'DECLINED' },
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
          data: { id: 'wompi-tx-999', status: 'UNKNOWN_STATUS' },
        }),
      });

      const result = await adapter.createPayment({
        orderId: 'order-4',
        amountCop: 10000,
        idempotencyKey: 'idem-key-4',
      });

      expect(result.status).toBe('PENDING');
    });

    it('lanza error retryable en 5xx', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        adapter.createPayment({
          orderId: 'order-1',
          amountCop: 50000,
          idempotencyKey: 'idem-key-1',
        }),
      ).rejects.toThrow();
    });

    it('lanza error NO retryable en 4xx', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
      });

      await expect(
        adapter.createPayment({
          orderId: 'order-1',
          amountCop: 50000,
          idempotencyKey: 'idem-key-1',
        }),
      ).rejects.toThrow();
    });

    it('no registra PAN/CVV/fecha en errores', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
      });

      try {
        await adapter.createPayment({
          orderId: 'order-1',
          amountCop: 50000,
          idempotencyKey: 'idem-key-1',
        });
        fail('Should have thrown');
      } catch (error) {
        const errorStr = JSON.stringify(error);
        expect(errorStr).not.toMatch(/\d{13,19}/); // No PAN
        expect(errorStr).not.toMatch(/cvv|cvc/i);
      }
    });
  });

  describe('queryPaymentStatus', () => {
    it('consulta estado exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-123', status: 'APPROVED' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-123');

      expect(result.status).toBe('APPROVED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.wompi.co/v1/transactions/wompi-tx-123',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('mapea status DECLINED correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-456', status: 'DECLINED' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-456');

      expect(result.status).toBe('DECLINED');
    });

    it('mapea status VOIDED como ERROR', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-789', status: 'VOIDED' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-789');

      expect(result.status).toBe('ERROR');
    });

    it('mapea status ERROR correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-101', status: 'ERROR' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-101');

      expect(result.status).toBe('ERROR');
    });

    it('mapea status PENDING correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-202', status: 'PENDING' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-202');

      expect(result.status).toBe('PENDING');
    });

    it('mapea status desconocido como PENDING por defecto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-tx-303', status: 'UNKNOWN' },
        }),
      });

      const result = await adapter.queryPaymentStatus('wompi-tx-303');

      expect(result.status).toBe('PENDING');
    });

    it('lanza error en respuesta HTTP no exitosa', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(adapter.queryPaymentStatus('wompi-tx-123')).rejects.toThrow();
    });
  });

  describe('refund', () => {
    it('crea refund exitoso y retorna resultado mapeado', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-refund-456', status: 'APPROVED' },
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: 'wompi-tx-123',
        amountCop: 25000,
        idempotencyKey: 'refund-key-1',
      });

      expect(result.providerRefundId).toBe('wompi-refund-456');
      expect(result.status).toBe('COMPLETED');
    });

    it('mapea refund status PENDING correctamente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-refund-789', status: 'PENDING' },
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: 'wompi-tx-123',
        amountCop: 10000,
        idempotencyKey: 'refund-key-2',
      });

      expect(result.status).toBe('PENDING');
    });

    it('mapea refund status DECLINED como FAILED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-refund-101', status: 'DECLINED' },
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: 'wompi-tx-123',
        amountCop: 10000,
        idempotencyKey: 'refund-key-3',
      });

      expect(result.status).toBe('FAILED');
    });

    it('mapea refund status desconocido como PENDING por defecto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: 'wompi-refund-202', status: 'UNKNOWN' },
        }),
      });

      const result = await adapter.refund({
        providerPaymentId: 'wompi-tx-123',
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
          providerPaymentId: 'wompi-tx-123',
          amountCop: 10000,
          idempotencyKey: 'refund-key-1',
        }),
      ).rejects.toThrow();
    });
  });

  describe('provider name', () => {
    it('reporta WOMPI como provider', () => {
      expect(adapter.provider).toBe('WOMPI');
    });
  });
});
