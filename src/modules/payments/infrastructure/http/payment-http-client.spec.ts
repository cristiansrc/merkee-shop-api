import { executeWithRetry, isRetryableHttpStatus, PaymentProviderHttpError } from './payment-http-client';
import {
  PaymentProviderConfig,
  DEFAULT_PAYMENT_TIMEOUT_MS,
  DEFAULT_PAYMENT_RETRIES,
  DEFAULT_REFUND_RETRIES,
} from '../../domain/payment-provider-config';

function makeConfig(overrides?: Partial<PaymentProviderConfig>): PaymentProviderConfig {
  return {
    name: 'WOMPI',
    baseUrl: 'https://api.wompi.co',
    secretKey: 'test-secret',
    timeoutMs: DEFAULT_PAYMENT_TIMEOUT_MS,
    paymentRetries: DEFAULT_PAYMENT_RETRIES,
    refundRetries: DEFAULT_REFUND_RETRIES,
    ...overrides,
  };
}

describe('payment-http-client', () => {
  describe('isRetryableHttpStatus', () => {
    it('clasa 5xx como retryable', () => {
      expect(isRetryableHttpStatus(500)).toBe(true);
      expect(isRetryableHttpStatus(502)).toBe(true);
      expect(isRetryableHttpStatus(503)).toBe(true);
      expect(isRetryableHttpStatus(504)).toBe(true);
    });

    it('clasa 4xx como NO retryable', () => {
      expect(isRetryableHttpStatus(400)).toBe(false);
      expect(isRetryableHttpStatus(401)).toBe(false);
      expect(isRetryableHttpStatus(403)).toBe(false);
      expect(isRetryableHttpStatus(404)).toBe(false);
      expect(isRetryableHttpStatus(422)).toBe(false);
    });

    it('clasa 2xx como NO retryable', () => {
      expect(isRetryableHttpStatus(200)).toBe(false);
      expect(isRetryableHttpStatus(201)).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('devuelve resultado exitoso en el primer intento', async () => {
      const config = makeConfig();
      const requestFn = jest.fn().mockResolvedValue({ id: 'pay-1' });

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ id: 'pay-1' });
      }
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('reintenta en error de red y exito en segundo intento', async () => {
      const config = makeConfig({
        paymentRetries: { maxRetries: 2, delaysMs: [10, 10] },
      });
      const requestFn = jest.fn()
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({ id: 'pay-1' });

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(true);
      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it('NO reintenta en error 4xx de negocio', async () => {
      const config = makeConfig();
      const requestFn = jest.fn().mockRejectedValue(
        new PaymentProviderHttpError('Bad Request', 400, 'WOMPI', false),
      );

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(false);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('NO reintenta en error 401 (auth fallida)', async () => {
      const config = makeConfig();
      const requestFn = jest.fn().mockRejectedValue(
        new PaymentProviderHttpError('Unauthorized', 401, 'WOMPI', false),
      );

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(false);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('NO reintenta en error 422 (regla de negocio)', async () => {
      const config = makeConfig();
      const requestFn = jest.fn().mockRejectedValue(
        new PaymentProviderHttpError('Unprocessable', 422, 'MERCADO_PAGO', false),
      );

      const result = await executeWithRetry(config, 'refund', requestFn);

      expect(result.ok).toBe(false);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('reintenta en 5xx y agota reintentos', async () => {
      const config = makeConfig({
        paymentRetries: { maxRetries: 2, delaysMs: [10, 10] },
      });
      const requestFn = jest.fn().mockRejectedValue(
        new PaymentProviderHttpError('Server Error', 500, 'WOMPI', true),
      );

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(false);
      expect(requestFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('usa delays de refund (1m/5m/15m/1h/6h) en modo refund', async () => {
      const config = makeConfig({
        refundRetries: { maxRetries: 2, delaysMs: [10, 10] },
      });
      const requestFn = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ id: 'refund-1' });

      const result = await executeWithRetry(config, 'refund', requestFn);

      expect(result.ok).toBe(true);
      expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it('no contiene PAN/CVV/fecha en errores', async () => {
      const config = makeConfig();
      const requestFn = jest.fn().mockRejectedValue(
        new PaymentProviderHttpError('Error with card data', 400, 'WOMPI', false),
      );

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errorStr = JSON.stringify(result.error);
        expect(errorStr).not.toMatch(/\d{13,19}/); // No PAN
        expect(errorStr).not.toMatch(/cvv|cvc/i);
        expect(errorStr).not.toMatch(/\d{2}\/\d{2,4}/); // No expiry MM/YY
      }
    });

    it('error desconocido NO es retryable', async () => {
      const config = makeConfig({
        paymentRetries: { maxRetries: 3, delaysMs: [10, 10, 10] },
      });
      const requestFn = jest.fn().mockRejectedValue(new Error('Something weird'));

      const result = await executeWithRetry(config, 'payment', requestFn);

      expect(result.ok).toBe(false);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });
  });
});
