import { RealCartReservationAdapter } from './real-cart-reservation.adapter';

describe('RealCartReservationAdapter', () => {
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    closeCart: jest.fn(),
  };
  const mockStockReservation = {
    releaseAllForCart: jest.fn(),
  };

  let adapter: RealCartReservationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new RealCartReservationAdapter(
      mockCartRepo as any,
      mockStockReservation as any,
    );
  });

  it('libera reservas ACTIVE y cierra carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [],
    });
    mockStockReservation.releaseAllForCart.mockResolvedValue(undefined);
    mockCartRepo.closeCart.mockResolvedValue(undefined);

    await adapter.releaseActiveReservations('session-guest');

    expect(mockStockReservation.releaseAllForCart).toHaveBeenCalledWith(
      'cart-1',
    );
  });

  it('no-op cuando no hay carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue(null);

    await adapter.releaseActiveReservations('session-sin-carrito');

    expect(mockStockReservation.releaseAllForCart).not.toHaveBeenCalled();
  });

  it('cierra el carrito', async () => {
    mockCartRepo.closeCart.mockResolvedValue(undefined);

    await adapter.closeCart('session-guest');

    expect(mockCartRepo.closeCart).toHaveBeenCalledWith('session-guest');
  });
});
