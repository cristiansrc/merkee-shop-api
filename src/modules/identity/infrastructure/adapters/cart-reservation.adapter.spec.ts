import { CartReservationAdapter } from './cart-reservation.adapter';

describe('CartReservationAdapter (identity)', () => {
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    closeCart: jest.fn(),
    transferCartToSession: jest.fn(),
  };
  const mockStockReservation = {
    releaseAllForCart: jest.fn(),
  };

  let adapter: CartReservationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new CartReservationAdapter(
      mockCartRepo as any,
      mockStockReservation as any,
    );
  });

  it('libera reservas ACTIVE del carrito guest', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [],
    });
    mockStockReservation.releaseAllForCart.mockResolvedValue(undefined);

    const result = await adapter.releaseActiveReservations('session-guest');

    expect(result.ok).toBe(true);
    expect(mockStockReservation.releaseAllForCart).toHaveBeenCalledWith('cart-1');
  });

  it('no-op cuando no hay carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue(null);

    const result = await adapter.releaseActiveReservations('session-sin-carrito');

    expect(result.ok).toBe(true);
    expect(mockStockReservation.releaseAllForCart).not.toHaveBeenCalled();
  });

  it('cierra el carrito', async () => {
    mockCartRepo.closeCart.mockResolvedValue(undefined);

    const result = await adapter.closeCart('session-guest');

    expect(result.ok).toBe(true);
    expect(mockCartRepo.closeCart).toHaveBeenCalledWith('session-guest');
  });

  it('transfiere el carrito guest a la sesión destino', async () => {
    mockCartRepo.transferCartToSession.mockResolvedValue(undefined);

    const result = await adapter.transferGuestCart('session-guest', 'session-auth-1');

    expect(result.ok).toBe(true);
    expect(mockCartRepo.transferCartToSession).toHaveBeenCalledWith(
      'session-guest',
      'session-auth-1',
    );
  });

  it('traduce excepción técnica a TECHNICAL_DEPENDENCY_FAILURE en transfer', async () => {
    mockCartRepo.transferCartToSession.mockRejectedValue(new Error('DB fail'));

    const result = await adapter.transferGuestCart('session-guest', 'session-auth-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
    }
  });

  it('traduce excepción técnica a TECHNICAL_DEPENDENCY_FAILURE en release', async () => {
    mockCartRepo.findCartWithItems.mockRejectedValue(new Error('DB fail'));

    const result = await adapter.releaseActiveReservations('session-guest');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
    }
  });
});
