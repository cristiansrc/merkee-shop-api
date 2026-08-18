import { CheckoutReservationAdapter } from './checkout-reservation.adapter';

function buildMockStockReservation() {
  return {
    convertToCheckoutPending: jest.fn(),
  };
}

function buildMockCartRepo() {
  return {
    findCartWithItemsByCartId: jest.fn(),
  };
}

describe('CheckoutReservationAdapter', () => {
  let stockReservation: ReturnType<typeof buildMockStockReservation>;
  let cartRepo: ReturnType<typeof buildMockCartRepo>;
  let adapter: CheckoutReservationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    stockReservation = buildMockStockReservation();
    cartRepo = buildMockCartRepo();
    adapter = new CheckoutReservationAdapter(stockReservation as any, cartRepo as any);
  });

  describe('convertActiveToCheckoutPending', () => {
    it('convierte reservas ACTIVE a CHECKOUT_PENDING', async () => {
      (cartRepo.findCartWithItemsByCartId as jest.Mock).mockResolvedValue({
        cart: { id: 'cart-1' },
        items: [
          {
            id: 'item-1',
            reservation: { id: 'res-1', status: 'ACTIVE' },
          },
          {
            id: 'item-2',
            reservation: { id: 'res-2', status: 'ACTIVE' },
          },
        ],
      });
      await adapter.convertActiveToCheckoutPending('cart-1');
      expect(stockReservation.convertToCheckoutPending).toHaveBeenCalledTimes(2);
      expect(stockReservation.convertToCheckoutPending).toHaveBeenCalledWith('res-1');
      expect(stockReservation.convertToCheckoutPending).toHaveBeenCalledWith('res-2');
    });

    it('lanza error cuando el carrito no existe', async () => {
      (cartRepo.findCartWithItemsByCartId as jest.Mock).mockResolvedValue(null);
      await expect(adapter.convertActiveToCheckoutPending('nonexistent')).rejects.toThrow('CART_NOT_FOUND');
    });

    it('ignora items sin reserva o con reserva no ACTIVE', async () => {
      (cartRepo.findCartWithItemsByCartId as jest.Mock).mockResolvedValue({
        cart: { id: 'cart-1' },
        items: [
          { id: 'item-1', reservation: null },
          { id: 'item-2', reservation: { id: 'res-2', status: 'CHECKOUT_PENDING' } },
          { id: 'item-3', reservation: { id: 'res-3', status: 'ACTIVE' } },
        ],
      });
      await adapter.convertActiveToCheckoutPending('cart-1');
      expect(stockReservation.convertToCheckoutPending).toHaveBeenCalledTimes(1);
      expect(stockReservation.convertToCheckoutPending).toHaveBeenCalledWith('res-3');
    });

    it('lanza error técnico cuando el repositorio falla', async () => {
      (cartRepo.findCartWithItemsByCartId as jest.Mock).mockRejectedValue(new Error('DB fail'));
      await expect(adapter.convertActiveToCheckoutPending('cart-1')).rejects.toThrow('TECHNICAL_DEPENDENCY_FAILURE');
    });
  });
});
