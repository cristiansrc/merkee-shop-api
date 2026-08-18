import { InventoryReservationAdapter } from './inventory-reservation.adapter';

describe('InventoryReservationAdapter', () => {
  let adapter: InventoryReservationAdapter;

  beforeEach(() => {
    adapter = new InventoryReservationAdapter();
  });

  it('reserve lanza error no implementado', async () => {
    await expect(adapter.reserve('p1', 1)).rejects.toThrow(
      'InventoryReservationAdapter.reserve no implementado',
    );
  });

  it('release lanza error no implementado', async () => {
    await expect(adapter.release('r1')).rejects.toThrow(
      'InventoryReservationAdapter.release no implementado',
    );
  });
});
