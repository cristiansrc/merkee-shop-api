import { MercadoPagoWebhookSignatureAdapter } from './mercado-pago-webhook-signature.adapter';
import { PaymentProviderConfig } from '../../domain/payment-provider-config';

describe('MercadoPagoWebhookSignatureAdapter', () => {
  const config: PaymentProviderConfig = {
    name: 'MERCADO_PAGO',
    baseUrl: 'https://api.mercadopago.com',
    secretKey: 'test-access-token-mercado-pago-123456',
    timeoutMs: 10_000,
    paymentRetries: { maxRetries: 0, delaysMs: [] },
    refundRetries: { maxRetries: 0, delaysMs: [] },
  };

  let adapter: MercadoPagoWebhookSignatureAdapter;

  beforeEach(() => {
    adapter = new MercadoPagoWebhookSignatureAdapter(config);
  });

  describe('verify', () => {
    it('should return true for a valid HMAC-SHA256 signature', async () => {
      const rawBody = '{"data":{"id":"123","status":"approved"}}';
      const { createHmac } = await import('crypto');
      const expectedSignature = createHmac('sha256', config.secretKey)
        .update(rawBody, 'utf8')
        .digest('hex');

      const result = await adapter.verify(rawBody, expectedSignature);
      expect(result).toBe(true);
    });

    it('should return false for an invalid signature', async () => {
      const rawBody = '{"data":{"id":"123","status":"approved"}}';
      const invalidSignature = 'invalid-signature-hash';

      const result = await adapter.verify(rawBody, invalidSignature);
      expect(result).toBe(false);
    });

    it('should return false for an empty signature', async () => {
      const rawBody = '{"data":{"id":"123"}}';

      const result = await adapter.verify(rawBody, '');
      expect(result).toBe(false);
    });

    it('should handle signature with sha256= prefix', async () => {
      const rawBody = '{"data":{"id":"123"}}';
      const { createHmac } = await import('crypto');
      const hexSignature = createHmac('sha256', config.secretKey)
        .update(rawBody, 'utf8')
        .digest('hex');
      const prefixedSignature = `sha256=${hexSignature}`;

      const result = await adapter.verify(rawBody, prefixedSignature);
      expect(result).toBe(true);
    });

    it('should return false when raw body is tampered', async () => {
      const originalBody = '{"data":{"id":"123"}}';
      const tamperedBody = '{"data":{"id":"456"}}';
      const { createHmac } = await import('crypto');
      const signature = createHmac('sha256', config.secretKey)
        .update(originalBody, 'utf8')
        .digest('hex');

      const result = await adapter.verify(tamperedBody, signature);
      expect(result).toBe(false);
    });

    it('should return false for signature with wrong secret', async () => {
      const rawBody = '{"data":{"id":"123"}}';
      const { createHmac } = await import('crypto');
      const wrongSignature = createHmac('sha256', 'wrong-secret')
        .update(rawBody, 'utf8')
        .digest('hex');

      const result = await adapter.verify(rawBody, wrongSignature);
      expect(result).toBe(false);
    });
  });
});
