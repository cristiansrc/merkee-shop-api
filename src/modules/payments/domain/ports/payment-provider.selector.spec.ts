import { PaymentProviderSelector } from './payment-provider-selector';
import { FakePaymentProviderAdapter } from '../../infrastructure/adapters/fake-payment-provider.adapter';

describe('PaymentProviderSelector', () => {
  it('resuelve Wompi cuando se registra', () => {
    const wompi = new FakePaymentProviderAdapter('WOMPI');
    const selector = new PaymentProviderSelector(wompi);

    const resolved = selector.resolve('WOMPI');
    expect(resolved).toBe(wompi);
    expect(resolved.provider).toBe('WOMPI');
  });

  it('resuelve Mercado Pago cuando se registra', () => {
    const mp = new FakePaymentProviderAdapter('MERCADO_PAGO');
    const selector = new PaymentProviderSelector(mp);

    const resolved = selector.resolve('MERCADO_PAGO');
    expect(resolved).toBe(mp);
    expect(resolved.provider).toBe('MERCADO_PAGO');
  });

  it('resuelve ambos providers independientemente', () => {
    const wompi = new FakePaymentProviderAdapter('WOMPI');
    const mp = new FakePaymentProviderAdapter('MERCADO_PAGO');
    const selector = new PaymentProviderSelector(wompi, mp);

    expect(selector.resolve('WOMPI')).toBe(wompi);
    expect(selector.resolve('MERCADO_PAGO')).toBe(mp);
    expect(selector.resolve('WOMPI')).not.toBe(mp);
  });

  it('lanza error si el proveedor no está registrado', () => {
    const selector = new PaymentProviderSelector();

    expect(() => selector.resolve('WOMPI')).toThrow(
      'Payment provider not registered: WOMPI',
    );
  });

  it('el adapter resuelto ejecuta createPayment correctamente', async () => {
    const wompi = new FakePaymentProviderAdapter('WOMPI');
    const selector = new PaymentProviderSelector(wompi);

    const adapter = selector.resolve('WOMPI');
    const result = await adapter.createPayment({
      orderId: 'order-1',
      amountCop: 50000,
      idempotencyKey: 'key-1',
    });

    expect(result.providerPaymentId).toContain('fake-key-1');
    expect(result.status).toBe('APPROVED');
    expect(wompi.createPaymentCalls).toHaveLength(1);
    expect(wompi.createPaymentCalls[0].orderId).toBe('order-1');
  });

  it('el adapter resuelto ejecuta refund correctamente', async () => {
    const mp = new FakePaymentProviderAdapter('MERCADO_PAGO');
    const selector = new PaymentProviderSelector(mp);

    const adapter = selector.resolve('MERCADO_PAGO');
    const result = await adapter.refund({
      providerPaymentId: 'pay-123',
      amountCop: 25000,
      idempotencyKey: 'refund-key-1',
    });

    expect(result.providerRefundId).toContain('fake-refund-pay-123');
    expect(result.status).toBe('COMPLETED');
    expect(mp.refundCalls).toHaveLength(1);
    expect(mp.refundCalls[0].providerPaymentId).toBe('pay-123');
  });
});
