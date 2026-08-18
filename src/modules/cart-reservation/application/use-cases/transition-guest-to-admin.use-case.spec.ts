import { TransitionGuestToAdminUseCase } from './transition-guest-to-admin.use-case';
import { isSuccess, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('TransitionGuestToAdminUseCase', () => {
  const mockCartRepo = {
    findCartWithItems: jest.fn(),
    closeCart: jest.fn(),
  };
  const mockStockReservation = {
    releaseAllForCart: jest.fn(),
  };

  let useCase: TransitionGuestToAdminUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new TransitionGuestToAdminUseCase(
      mockCartRepo as any,
      mockStockReservation as any,
    );
  });

  it('libera reservas ACTIVE y cierra carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
          reservation: { id: 'res-1', status: 'ACTIVE' },
        },
      ],
    });
    mockStockReservation.releaseAllForCart.mockResolvedValue(undefined);
    mockCartRepo.closeCart.mockResolvedValue(undefined);

    const result = await useCase.execute('session-guest');

    expect(isSuccess(result)).toBe(true);
    expect(mockStockReservation.releaseAllForCart).toHaveBeenCalledWith(
      'cart-1',
    );
    expect(mockCartRepo.closeCart).toHaveBeenCalledWith('session-guest');
  });

  it('es no-op idempotente cuando no hay carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue(null);

    const result = await useCase.execute('session-sin-carrito');

    expect(isSuccess(result)).toBe(true);
    expect(mockStockReservation.releaseAllForCart).not.toHaveBeenCalled();
    expect(mockCartRepo.closeCart).not.toHaveBeenCalled();
  });

  it('devuelve failure cuando falla la liberación de reservas', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [],
    });
    mockStockReservation.releaseAllForCart.mockRejectedValue(
      new Error('DB error'),
    );

    const result = await useCase.execute('session-guest');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
  });

  it('devuelve failure cuando falla el cierre del carrito', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [],
    });
    mockStockReservation.releaseAllForCart.mockResolvedValue(undefined);
    mockCartRepo.closeCart.mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute('session-guest');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
  });

  it('no falla cuando el carrito tiene reservas CHECKOUT_PENDING', async () => {
    mockCartRepo.findCartWithItems.mockResolvedValue({
      cart: { id: 'cart-1', sessionId: 'session-guest', status: 'ACTIVE' },
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
          reservation: { id: 'res-1', status: 'CHECKOUT_PENDING' },
        },
      ],
    });
    mockStockReservation.releaseAllForCart.mockResolvedValue(undefined);
    mockCartRepo.closeCart.mockResolvedValue(undefined);

    const result = await useCase.execute('session-guest');

    expect(isSuccess(result)).toBe(true);
    // releaseAllForCart solo libera ACTIVE, no CHECKOUT_PENDING
    expect(mockStockReservation.releaseAllForCart).toHaveBeenCalledWith(
      'cart-1',
    );
    expect(mockCartRepo.closeCart).toHaveBeenCalledWith('session-guest');
  });
});
