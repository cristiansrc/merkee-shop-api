import { NoopCartReservationAdapter } from './noop-cart-reservation.adapter';

describe('NoopCartReservationAdapter', () => {
  let adapter: NoopCartReservationAdapter;

  beforeEach(() => {
    adapter = new NoopCartReservationAdapter();
  });

  describe('releaseActiveReservations', () => {
    it('retorna ok sin liberar reservas', async () => {
      const result = await adapter.releaseActiveReservations('session-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('closeCart', () => {
    it('retorna ok sin cerrar carrito', async () => {
      const result = await adapter.closeCart('session-1');
      expect(result.ok).toBe(true);
    });
  });
});
