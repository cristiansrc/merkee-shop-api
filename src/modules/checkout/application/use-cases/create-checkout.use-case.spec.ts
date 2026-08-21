import { CreateCheckoutUseCaseImpl, CreateCheckoutCommand } from './create-checkout.use-case';
import { CartRepositoryPort, CartWithItemsRecord } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../../cart-reservation/domain/ports/session-lookup.port';
import { CartIdempotencyPort } from '../../../cart-reservation/domain/ports/cart-idempotency.port';
import { CartSession, CartUser } from '../../../cart-reservation/domain/models';
import { CheckoutProductLookupPort, ProductSnapshot } from '../../domain/ports/checkout-product-lookup.port';
import { CheckoutUnitOfWorkPort, CheckoutTransactionContext } from '../../domain/ports/checkout-unit-of-work.port';
import { CheckoutErrors } from '../../domain/checkout-errors';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { PaymentProviderSelector } from '../../../payments/domain/ports/payment-provider-selector';
import { PaymentProviderPort } from '../../../payments/domain/ports/payment-provider.port';

/** Construye un selector de proveedor mock que devuelve una URL de checkout. */
function makeProviderSelector(overrides?: {
  createPaymentResult?: Partial<{
    providerPaymentId: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED';
    checkoutUrl: string;
  }>;
  createPaymentError?: Error;
}): PaymentProviderSelector {
  const provider: PaymentProviderPort = {
    provider: 'WOMPI',
    createPayment: jest.fn().mockImplementation(() => {
      if (overrides?.createPaymentError) {
        return Promise.reject(overrides.createPaymentError);
      }
      return Promise.resolve({
        providerPaymentId: 'wompi-tx-1',
        status: 'PENDING' as const,
        checkoutUrl: 'https://checkout.wompi.co/p/wompi-tx-1',
        ...(overrides?.createPaymentResult ?? {}),
      });
    }),
    queryPaymentStatus: jest.fn(),
    refund: jest.fn(),
  };
  return { resolve: jest.fn().mockReturnValue(provider) } as unknown as PaymentProviderSelector;
}

describe('CreateCheckoutUseCase', () => {
  let useCase: CreateCheckoutUseCaseImpl;
  let cartRepo: jest.Mocked<CartRepositoryPort>;
  let sessionLookup: jest.Mocked<SessionLookupPort>;
  let productLookup: jest.Mocked<CheckoutProductLookupPort>;
  let unitOfWork: jest.Mocked<CheckoutUnitOfWorkPort>;
  let providerSelector: PaymentProviderSelector;
  let idempotency: jest.Mocked<CartIdempotencyPort>;

  const mockSession: CartSession = {
    id: 'session-1',
    userId: 'user-1',
    sessionKind: 'AUTHENTICATED',
    expiresAt: new Date(Date.now() + 600000),
    lastActivityAt: new Date(),
    revokedAt: null,
  };

  const mockUser: CartUser = {
    id: 'user-1',
    role: 'cliente',
    mustChangePassword: false,
  };

  const mockProduct1: ProductSnapshot = {
    id: 'product-1',
    name: 'Arroz',
    regularPriceCop: 5000n,
    salePriceCop: 4500n,
    unit: 'kg',
  };

  const mockProduct2: ProductSnapshot = {
    id: 'product-2',
    name: 'Frijol',
    regularPriceCop: 3000n,
    salePriceCop: 0n,
    unit: 'kg',
  };

  const mockCartWithItems: CartWithItemsRecord = {
    cart: {
      id: 'cart-1',
      sessionId: 'session-1',
      status: 'ACTIVE',
      itemsSubtotalCop: 0n,
      deliveryFeeCop: 5000n,
      ivaCop: 0n,
      taxRateBasisPoints: 1900,
      totalCop: 5000n,
      reservationExpiresAt: new Date(Date.now() + 600000),
    },
    items: [
      {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'product-1',
        quantity: 2,
        unitPriceCop: 4500n,
        subtotalCop: 9000n,
        reservation: {
          id: 'res-1',
          cartItemId: 'item-1',
          productId: 'product-1',
          quantity: 2,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 600000),
        },
      },
      {
        id: 'item-2',
        cartId: 'cart-1',
        productId: 'product-2',
        quantity: 3,
        unitPriceCop: 3000n,
        subtotalCop: 9000n,
        reservation: {
          id: 'res-2',
          cartItemId: 'item-2',
          productId: 'product-2',
          quantity: 3,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 600000),
        },
      },
    ],
  };

  function makeCommand(overrides?: Partial<CreateCheckoutCommand>): CreateCheckoutCommand {
    return {
      sessionId: 'session-1',
      userId: 'user-1',
      deliveryAddress: {
        recipientName: 'Juan Pérez',
        line1: 'Calle 123',
        city: 'Bogotá',
        phone: '3001234567',
      },
      paymentProvider: 'WOMPI',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      canonicalBody: '{"delivery_address":{"recipient_name":"Juan Pérez","line1":"Calle 123","city":"Bogotá","phone":"3001234567"},"payment_provider":"WOMPI"}',
      ...overrides,
    };
  }

  /** Monta un ctx transaccional mock que captura los params de creación de orden. */
  function mockUnitOfWork(overrides?: {
    orderCreator?: (params: any) => any;
    existingRecord?: { bodyHash: string; responseJson: unknown } | null;
  }): { getCapturedParams: () => any; orderCreated: () => boolean } {
    let capturedParams: any;
    let orderCreated = false;
    const defaultOrderResult = {
      orderId: 'order-1',
      orderNumber: 'ORD-001',
      paymentId: 'payment-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    unitOfWork.run.mockImplementation(async (work: any) => {
      const ctx: CheckoutTransactionContext = {
        cartWithItems: mockCartWithItems,
        reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
        orderCreator: {
          createOrderAndPayment: jest.fn().mockImplementation((params) => {
            capturedParams = params;
            if (orderCreated) {
              return Promise.reject(new Error('ORDER_ALREADY_EXISTS'));
            }
            orderCreated = true;
            return Promise.resolve(overrides?.orderCreator ? overrides.orderCreator(params) : defaultOrderResult);
          }),
        },
        idempotency: {
          findForUpdate: jest.fn().mockResolvedValue(overrides?.existingRecord ?? null),
          save: jest.fn(),
        },
      };
      try {
        return await work(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'ORDER_ALREADY_EXISTS') {
          return fail(CheckoutErrors.orderAlreadyExists());
        }
        return fail(CheckoutErrors.technicalFailure());
      }
    });

    return { getCapturedParams: () => capturedParams, orderCreated: () => orderCreated };
  }

  beforeEach(() => {
    cartRepo = {
      findCartWithItems: jest.fn(),
      findCartWithItemsByCartId: jest.fn(),
      createCart: jest.fn(),
      updateCartTotals: jest.fn(),
      findCartItem: jest.fn(),
      findCartItemById: jest.fn(),
      createCartItem: jest.fn(),
      updateCartItemQuantity: jest.fn(),
      deleteCartItem: jest.fn(),
      closeCart: jest.fn(),
      transferCartToSession: jest.fn(),
      touchSession: jest.fn(),
    };

    sessionLookup = {
      findById: jest.fn(),
      findUserById: jest.fn(),
    };

    productLookup = {
      findByIds: jest.fn(),
    };

    unitOfWork = {
      run: jest.fn(),
    };

    providerSelector = makeProviderSelector();

    idempotency = {
      find: jest.fn().mockResolvedValue(null),
      findForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };

    useCase = new CreateCheckoutUseCaseImpl(
      cartRepo,
      sessionLookup,
      productLookup,
      unitOfWork,
      providerSelector,
      idempotency,
    );

    sessionLookup.findById.mockResolvedValue(mockSession);
    sessionLookup.findUserById.mockResolvedValue(mockUser);
    cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
    productLookup.findByIds.mockResolvedValue(
      new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
    );
  });

  describe('IVA calculation (AC-08 / ADR-009)', () => {
    it('calculates IVA correctly with floor((subtotal*19+50)/100)', async () => {
      const { getCapturedParams } = mockUnitOfWork();

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.itemsSubtotalCop).toBe(18000);
        expect(result.value.ivaCop).toBe(3420);
        expect(result.value.deliveryFeeCop).toBe(5000);
        expect(result.value.totalCop).toBe(26420);
        expect(result.value.providerCheckoutUrl).toBe('https://checkout.wompi.co/p/wompi-tx-1');
      }

      const capturedParams = getCapturedParams();
      expect(capturedParams.itemsSubtotalCop).toBe(18000n);
      expect(capturedParams.ivaCop).toBe(3420n);
      expect(capturedParams.deliveryFeeCop).toBe(5000n);
      expect(capturedParams.totalCop).toBe(26420n);
      expect(capturedParams.taxRateBasisPoints).toBe(1900);
      expect(capturedParams.provider).toBe('WOMPI');
    });

    it('recalculates prices from server, not trusting client', async () => {
      let capturedItems: any[] = [];
      mockUnitOfWork({
        orderCreator: (params) => {
          capturedItems = params.items;
          return {
            orderId: 'order-1',
            orderNumber: 'ORD-001',
            paymentId: 'payment-1',
            createdAt: '2026-01-01T00:00:00.000Z',
          };
        },
      });

      await useCase.execute(makeCommand({ canonicalBody: '{}' }));

      // Verify server recalculated prices (salePrice for product-1, regularPrice for product-2)
      expect(capturedItems[0].unitPriceCop).toBe(4500n); // salePrice
      expect(capturedItems[1].unitPriceCop).toBe(3000n); // regularPrice (no sale)
    });
  });

  describe('422 states and reservations', () => {
    it('returns CHECKOUT_NOT_ALLOWED for empty cart', async () => {
      cartRepo.findCartWithItems.mockResolvedValue({
        cart: mockCartWithItems.cart,
        items: [],
      });

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.CHECKOUT_NOT_ALLOWED);
      }
    });

    it('returns RESERVATION_NOT_ACTIVE for expired reservation', async () => {
      const cartWithExpiredReservation: CartWithItemsRecord = {
        cart: mockCartWithItems.cart,
        items: [
          {
            ...mockCartWithItems.items[0],
            reservation: {
              ...mockCartWithItems.items[0].reservation!,
              status: 'EXPIRED',
            },
          },
        ],
      };

      cartRepo.findCartWithItems.mockResolvedValue(cartWithExpiredReservation);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESERVATION_NOT_ACTIVE);
      }
    });

    it('returns RESERVATION_NOT_ACTIVE for item without reservation', async () => {
      const cartWithoutReservation: CartWithItemsRecord = {
        cart: mockCartWithItems.cart,
        items: [
          {
            ...mockCartWithItems.items[0],
            reservation: null,
          },
        ],
      };

      cartRepo.findCartWithItems.mockResolvedValue(cartWithoutReservation);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESERVATION_NOT_ACTIVE);
      }
    });

    it('returns ADMIN_STOREFRONT_PURCHASE_FORBIDDEN for admin', async () => {
      const adminUser: CartUser = {
        id: 'admin-1',
        role: 'admin',
        mustChangePassword: false,
      };

      sessionLookup.findUserById.mockResolvedValue(adminUser);

      const result = await useCase.execute(
        makeCommand({
          userId: 'admin-1',
          deliveryAddress: {
            recipientName: 'Admin',
            line1: 'Calle 456',
            city: 'Bogotá',
            phone: '3009876543',
          },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN);
      }
    });

    it('returns SESSION_EXPIRED for expired session', async () => {
      sessionLookup.findById.mockResolvedValue(null);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
      }
    });

    it('returns SESSION_EXPIRED for revoked session', async () => {
      const revokedSession: CartSession = {
        ...mockSession,
        revokedAt: new Date(),
      };

      sessionLookup.findById.mockResolvedValue(revokedSession);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
      }
    });

    it('returns RESOURCE_NOT_FOUND when a product no longer exists', async () => {
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1]]), // product-2 missing
      );

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      }
    });
  });

  describe('Proveedor de pago', () => {
    it('llama al proveedor y devuelve providerCheckoutUrl', async () => {
      mockUnitOfWork();
      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerCheckoutUrl).toBe('https://checkout.wompi.co/p/wompi-tx-1');
        expect(result.value.providerReference).toBe('wompi-tx-1');
      }
    });

    it('resuelve el proveedor según payment_provider (MERCADO_PAGO)', async () => {
      const mpProvider: PaymentProviderPort = {
        provider: 'MERCADO_PAGO',
        createPayment: jest.fn().mockResolvedValue({
          providerPaymentId: 'mp-pay-1',
          status: 'PENDING',
          checkoutUrl: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1',
        }),
        queryPaymentStatus: jest.fn(),
        refund: jest.fn(),
      };
      providerSelector = { resolve: jest.fn().mockReturnValue(mpProvider) } as unknown as PaymentProviderSelector;
      useCase = new CreateCheckoutUseCaseImpl(cartRepo, sessionLookup, productLookup, unitOfWork, providerSelector, idempotency);

      mockUnitOfWork();
      const result = await useCase.execute(makeCommand({ paymentProvider: 'MERCADO_PAGO' }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.paymentProvider).toBe('MERCADO_PAGO');
        expect(result.value.providerCheckoutUrl).toContain('mercadopago');
      }
    });

    it('returns TECHNICAL_DEPENDENCY_FAILURE cuando el proveedor falla (sin estado parcial)', async () => {
      providerSelector = makeProviderSelector({ createPaymentError: new Error('network') });
      useCase = new CreateCheckoutUseCaseImpl(cartRepo, sessionLookup, productLookup, unitOfWork, providerSelector, idempotency);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      }
      // La transacción nunca se ejecutó: no hay orden/pago/reservas convertidas
      expect(unitOfWork.run).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent checkout', () => {
    it('only one checkout creates order/payment', async () => {
      mockUnitOfWork();

      // Simulate concurrent checkouts
      const [result1, result2] = await Promise.all([
        useCase.execute(makeCommand()),
        useCase.execute(makeCommand({ idempotencyKey: '660e8400-e29b-41d4-a716-446655440001' })),
      ]);

      // Only one should succeed
      const successCount = [result1, result2].filter((r) => r.ok).length;
      expect(successCount).toBe(1);
    });
  });

  describe('Fallback guest→cliente (transferencia de carrito)', () => {
    const guestSession: CartSession = {
      id: 'guest-session-1',
      userId: null,
      sessionKind: 'GUEST',
      expiresAt: new Date(Date.now() + 600000),
      lastActivityAt: new Date(),
      revokedAt: null,
    };

    it('transfiere el carrito guest cuando la sesión autenticada no tiene carrito', async () => {
      const guestCartWithItems: CartWithItemsRecord = {
        ...mockCartWithItems,
        cart: { ...mockCartWithItems.cart, id: 'cart-guest', sessionId: 'guest-session-1' },
      };

      sessionLookup.findById.mockImplementation((sid) =>
        sid === 'session-1'
          ? Promise.resolve(mockSession)
          : Promise.resolve(guestSession),
      );

      let transferred = false;
      cartRepo.findCartWithItems.mockImplementation((sid) => {
        if (sid === 'guest-session-1') return Promise.resolve(guestCartWithItems);
        return Promise.resolve(transferred ? mockCartWithItems : null);
      });
      cartRepo.transferCartToSession.mockImplementation(async () => {
        transferred = true;
      });

      mockUnitOfWork();

      const result = await useCase.execute(makeCommand({ guestSessionId: 'guest-session-1' }));

      expect(cartRepo.transferCartToSession).toHaveBeenCalledWith(
        'guest-session-1',
        'session-1',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orderId).toBe('order-1');
      }
    });

    it('no transfiere si la sesión guest no existe o está revocada', async () => {
      sessionLookup.findById.mockImplementation((sid) =>
        sid === 'session-1'
          ? Promise.resolve(mockSession)
          : Promise.resolve(null),
      );
      cartRepo.findCartWithItems.mockResolvedValue(null);

      const result = await useCase.execute(makeCommand({ guestSessionId: 'guest-session-1' }));

      expect(cartRepo.transferCartToSession).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.CHECKOUT_NOT_ALLOWED);
      }
    });

    it('no transfiere si la sesión guest está expirada', async () => {
      sessionLookup.findById.mockImplementation((sid) =>
        sid === 'session-1'
          ? Promise.resolve(mockSession)
          : Promise.resolve({ ...guestSession, expiresAt: new Date(Date.now() - 1) }),
      );
      cartRepo.findCartWithItems.mockResolvedValue(null);

      const result = await useCase.execute(makeCommand({ guestSessionId: 'guest-session-1' }));

      expect(cartRepo.transferCartToSession).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.CHECKOUT_NOT_ALLOWED);
      }
    });

    it('devuelve CHECKOUT_NOT_ALLOWED (422) y no SESSION_EXPIRED cuando no hay carrito', async () => {
      cartRepo.findCartWithItems.mockResolvedValue(null);
      sessionLookup.findById.mockResolvedValue(mockSession);

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.CHECKOUT_NOT_ALLOWED);
        expect(result.error.code).not.toBe(DomainErrorCode.SESSION_EXPIRED);
      }
    });
  });

  describe('Idempotency', () => {
    it('returns same result on replay with same idempotency key', async () => {
      const canonicalBody = makeCommand().canonicalBody;
      const { createHash } = await import('crypto');
      const bodyHash = createHash('sha256').update(canonicalBody).digest('hex');

      const existingRecord = {
        bodyHash,
        responseJson: {
          orderId: 'order-1',
          orderNumber: 'ORD-001',
          paymentId: 'payment-1',
          itemsSubtotalCop: 18000,
          deliveryFeeCop: 5000,
          ivaCop: 3420,
          taxRateBasisPoints: 1900,
          totalCop: 26420,
          items: [],
          delivery: {
            recipientName: 'Juan Pérez',
            line1: 'Calle 123',
            city: 'Bogotá',
            phone: '3001234567',
          },
          paymentProvider: 'WOMPI',
          providerReference: 'wompi-tx-1',
          providerCheckoutUrl: 'https://checkout.wompi.co/p/wompi-tx-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      };

      mockUnitOfWork({ existingRecord });

      const result = await useCase.execute(makeCommand());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orderId).toBe('order-1');
        expect(result.value.providerCheckoutUrl).toBe('https://checkout.wompi.co/p/wompi-tx-1');
      }
    });

    it('returns IDEMPOTENCY_KEY_REUSED on divergent body', async () => {
      const existingRecord = {
        bodyHash: 'different-hash',
        responseJson: {},
      };

      mockUnitOfWork({ existingRecord });

      const result = await useCase.execute(
        makeCommand({ canonicalBody: '{"delivery_address":{"recipient_name":"Different"}}' }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
      }
    });

    it('no invoca al proveedor en replay idempotente (pre-check sin pago externo duplicado)', async () => {
      const canonicalBody = makeCommand().canonicalBody;
      const { createHash } = await import('crypto');
      const bodyHash = createHash('sha256').update(canonicalBody).digest('hex');

      idempotency.find.mockResolvedValue({
        id: 'rec-1',
        scope: 'checkout:user-1',
        idempotencyKey: makeCommand().idempotencyKey,
        bodyHash,
        responseJson: {
          orderId: 'order-1',
          orderNumber: 'ORD-001',
          paymentId: 'payment-1',
          itemsSubtotalCop: 18000,
          deliveryFeeCop: 5000,
          ivaCop: 3420,
          taxRateBasisPoints: 1900,
          totalCop: 26420,
          items: [],
          delivery: {
            recipientName: 'Juan Pérez',
            line1: 'Calle 123',
            city: 'Bogotá',
            phone: '3001234567',
          },
          paymentProvider: 'WOMPI',
          providerReference: 'wompi-tx-1',
          providerCheckoutUrl: 'https://checkout.wompi.co/p/wompi-tx-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const createPayment = jest.fn();
      const provider: PaymentProviderPort = {
        provider: 'WOMPI',
        createPayment,
        queryPaymentStatus: jest.fn(),
        refund: jest.fn(),
      };
      providerSelector = { resolve: jest.fn().mockReturnValue(provider) } as unknown as PaymentProviderSelector;
      useCase = new CreateCheckoutUseCaseImpl(cartRepo, sessionLookup, productLookup, unitOfWork, providerSelector, idempotency);

      const result = await useCase.execute(makeCommand());

      expect(createPayment).not.toHaveBeenCalled();
      expect(unitOfWork.run).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orderId).toBe('order-1');
      }
    });

    it('devuelve IDEMPOTENCY_KEY_REUSED en el pre-check si el body diverge', async () => {
      idempotency.find.mockResolvedValue({
        id: 'rec-1',
        scope: 'checkout:user-1',
        idempotencyKey: makeCommand().idempotencyKey,
        bodyHash: 'different-hash',
        responseJson: {},
      });

      const createPayment = jest.fn();
      const provider: PaymentProviderPort = {
        provider: 'WOMPI',
        createPayment,
        queryPaymentStatus: jest.fn(),
        refund: jest.fn(),
      };
      providerSelector = { resolve: jest.fn().mockReturnValue(provider) } as unknown as PaymentProviderSelector;
      useCase = new CreateCheckoutUseCaseImpl(cartRepo, sessionLookup, productLookup, unitOfWork, providerSelector, idempotency);

      const result = await useCase.execute(makeCommand());

      expect(createPayment).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
      }
    });
  });
});
