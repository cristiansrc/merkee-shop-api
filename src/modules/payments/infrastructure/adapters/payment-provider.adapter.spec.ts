import { PaymentProviderAdapter } from './payment-provider.adapter';

describe('PaymentProviderAdapter', () => {
  let adapter: PaymentProviderAdapter;

  beforeEach(() => {
    adapter = new PaymentProviderAdapter();
  });

  it('tiene provider WOMPI por defecto', () => {
    expect(adapter.provider).toBe('WOMPI');
  });

  it('createPayment lanza error no implementado', async () => {
    await expect(
      adapter.createPayment({} as any),
    ).rejects.toThrow('PaymentProviderAdapter.createPayment no implementado');
  });

  it('refund lanza error no implementado', async () => {
    await expect(
      adapter.refund({} as any),
    ).rejects.toThrow('PaymentProviderAdapter.refund no implementado');
  });
});
