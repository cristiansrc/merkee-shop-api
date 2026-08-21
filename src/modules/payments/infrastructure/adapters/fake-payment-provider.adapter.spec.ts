import { FakePaymentProviderAdapter } from './fake-payment-provider.adapter';

describe('FakePaymentProviderAdapter', () => {
  it('crea pago con respuesta por defecto', async () => {
    const adapter = new FakePaymentProviderAdapter('WOMPI');

    const result = await adapter.createPayment({
      orderId: 'order-1',
      amountCop: 50000,
      idempotencyKey: 'key-1',
    });

    expect(result.providerPaymentId).toBe('fake-key-1');
    expect(result.status).toBe('APPROVED');
    expect(adapter.createPaymentCalls).toHaveLength(1);
  });

  it('consulta estado de pago con respuesta por defecto (PENDING)', async () => {
    const adapter = new FakePaymentProviderAdapter('WOMPI');

    const result = await adapter.queryPaymentStatus('pay-123');

    expect(result.status).toBe('PENDING');
    expect(adapter.queryPaymentStatusCalls).toEqual(['pay-123']);
  });

  it('consulta estado de pago con handler personalizado', async () => {
    const adapter = new FakePaymentProviderAdapter('WOMPI');
    adapter.onQueryPaymentStatus(async () => ({ status: 'APPROVED' }));

    const result = await adapter.queryPaymentStatus('pay-456');

    expect(result.status).toBe('APPROVED');
    expect(adapter.queryPaymentStatusCalls).toEqual(['pay-456']);
  });

  it('crea refund con respuesta por defecto', async () => {
    const adapter = new FakePaymentProviderAdapter('MERCADO_PAGO');

    const result = await adapter.refund({
      providerPaymentId: 'pay-123',
      amountCop: 25000,
      idempotencyKey: 'refund-key-1',
    });

    expect(result.providerRefundId).toBe('fake-refund-pay-123');
    expect(result.status).toBe('COMPLETED');
    expect(adapter.refundCalls).toHaveLength(1);
  });

  it('usa handler personalizado para createPayment', async () => {
    const adapter = new FakePaymentProviderAdapter('WOMPI');
    adapter.onCreatePayment(async (req) => ({
      providerPaymentId: `custom-${req.orderId}`,
      status: 'DECLINED',
      checkoutUrl: `https://checkout.example.test/p/${req.orderId}`,
    }));

    const result = await adapter.createPayment({
      orderId: 'order-2',
      amountCop: 10000,
      idempotencyKey: 'key-2',
    });

    expect(result.providerPaymentId).toBe('custom-order-2');
    expect(result.status).toBe('DECLINED');
  });

  it('usa handler personalizado para refund', async () => {
    const adapter = new FakePaymentProviderAdapter('MERCADO_PAGO');
    adapter.onRefund(async (req) => ({
      providerRefundId: `custom-refund-${req.providerPaymentId}`,
      status: 'FAILED',
    }));

    const result = await adapter.refund({
      providerPaymentId: 'pay-456',
      amountCop: 5000,
      idempotencyKey: 'refund-key-2',
    });

    expect(result.providerRefundId).toBe('custom-refund-pay-456');
    expect(result.status).toBe('FAILED');
  });

  it('reporta el provider correcto', () => {
    expect(new FakePaymentProviderAdapter('WOMPI').provider).toBe('WOMPI');
    expect(new FakePaymentProviderAdapter('MERCADO_PAGO').provider).toBe('MERCADO_PAGO');
  });

  it('contiene las llamadas realizadas', async () => {
    const adapter = new FakePaymentProviderAdapter('WOMPI');

    await adapter.createPayment({
      orderId: 'order-1',
      amountCop: 1000,
      idempotencyKey: 'k1',
    });
    await adapter.createPayment({
      orderId: 'order-2',
      amountCop: 2000,
      idempotencyKey: 'k2',
    });

    expect(adapter.createPaymentCalls).toHaveLength(2);
    expect(adapter.createPaymentCalls[0].orderId).toBe('order-1');
    expect(adapter.createPaymentCalls[1].orderId).toBe('order-2');
  });
});
