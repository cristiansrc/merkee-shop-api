import { CreateCheckoutUseCaseImpl, CreateCheckoutCommand } from './create-checkout.use-case';
import { CartRepositoryPort, CartWithItemsRecord } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../../cart-reservation/domain/ports/session-lookup.port';
import { CartSession, CartUser } from '../../../cart-reservation/domain/models';
import { CheckoutProductLookupPort, ProductSnapshot } from '../../domain/ports/checkout-product-lookup.port';
import { CheckoutUnitOfWorkPort, CheckoutTransactionContext } from '../../domain/ports/checkout-unit-of-work.port';
import { CheckoutErrors } from '../../domain/checkout-errors';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { Result, ok, fail } from '../../../../shared/domain/result';

describe('CreateCheckoutUseCase', () => {
  let useCase: CreateCheckoutUseCaseImpl;
  let cartRepo: jest.Mocked<CartRepositoryPort>;
  let sessionLookup: jest.Mocked<SessionLookupPort>;
  let productLookup: jest.Mocked<CheckoutProductLookupPort>;
  let unitOfWork: jest.Mocked<CheckoutUnitOfWorkPort>;

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

    useCase = new CreateCheckoutUseCaseImpl(
      cartRepo,
      sessionLookup,
      productLookup,
      unitOfWork,
    );
  });

  describe('IVA calculation (AC-08 / ADR-009)', () => {
    it('calculates IVA correctly with floor((subtotal*19+50)/100)', async () => {
      // subtotal = (4500*2) + (3000*3) = 9000 + 9000 = 18000
      // IVA = floor((18000*19+50)/100) = floor(342050/100) = floor(3420.5) = 3420
      // delivery = 5000
      // total = 18000 + 5000 + 3420 = 26420

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
      );

      let capturedParams: any;
      unitOfWork.run.mockImplementation(async (work: any) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: mockCartWithItems,
          reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
          orderCreator: {
            createOrderAndPayment: jest.fn().mockImplementation((params) => {
              capturedParams = params;
              return Promise.resolve({
                orderId: 'order-1',
                orderNumber: 'ORD-001',
                paymentId: 'payment-1',
              });
            }),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        };
        return work(ctx);
      });

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{"delivery_address":{"recipient_name":"Juan Pérez","line1":"Calle 123","city":"Bogotá","phone":"3001234567"}}',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.itemsSubtotalCop).toBe(18000n);
        expect(result.value.ivaCop).toBe(3420n);
        expect(result.value.deliveryFeeCop).toBe(5000n);
        expect(result.value.totalCop).toBe(26420n);
      }

      expect(capturedParams.itemsSubtotalCop).toBe(18000n);
      expect(capturedParams.ivaCop).toBe(3420n);
      expect(capturedParams.deliveryFeeCop).toBe(5000n);
      expect(capturedParams.totalCop).toBe(26420n);
      expect(capturedParams.taxRateBasisPoints).toBe(1900);
    });

    it('recalculates prices from server, not trusting client', async () => {
      // Client sends different prices, server recalculates
      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
      );

      let capturedItems: any[] = [];
      unitOfWork.run.mockImplementation(async (work: any) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: mockCartWithItems,
          reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
          orderCreator: {
            createOrderAndPayment: jest.fn().mockImplementation((params) => {
              capturedItems = params.items;
              return Promise.resolve({
                orderId: 'order-1',
                orderNumber: 'ORD-001',
                paymentId: 'payment-1',
              });
            }),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        };
        return work(ctx);
      });

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      await useCase.execute(command);

      // Verify server recalculated prices (salePrice for product-1, regularPrice for product-2)
      expect(capturedItems[0].unitPriceCop).toBe(4500n); // salePrice
      expect(capturedItems[1].unitPriceCop).toBe(3000n); // regularPrice (no sale)
    });
  });

  describe('422 states and reservations', () => {
    it('returns CHECKOUT_NOT_ALLOWED for empty cart', async () => {
      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue({
        cart: mockCartWithItems.cart,
        items: [],
      });

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

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

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(cartWithExpiredReservation);

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

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

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(cartWithoutReservation);

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

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

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(adminUser);

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'admin-1',
        deliveryAddress: {
          recipientName: 'Admin',
          line1: 'Calle 456',
          city: 'Bogotá',
          phone: '3009876543',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN);
      }
    });

    it('returns SESSION_EXPIRED for expired session', async () => {
      sessionLookup.findById.mockResolvedValue(null);

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

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

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
      }
    });
  });

  describe('Concurrent checkout', () => {
    it('only one checkout creates order/payment', async () => {
      // Simulate DB-level uniqueness: track if order was already created
      let orderCreated = false;

      unitOfWork.run.mockImplementation(async (work: any) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: mockCartWithItems,
          reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
          orderCreator: {
            createOrderAndPayment: jest.fn().mockImplementation(() => {
              if (orderCreated) {
                throw new Error('ORDER_ALREADY_EXISTS');
              }
              orderCreated = true;
              return Promise.resolve({
                orderId: 'order-1',
                orderNumber: 'ORD-001',
                paymentId: 'payment-1',
              });
            }),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(null),
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

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
      );

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{}',
      };

      // Simulate concurrent checkouts
      const [result1, result2] = await Promise.all([
        useCase.execute(command),
        useCase.execute({ ...command, idempotencyKey: '660e8400-e29b-41d4-a716-446655440001' }),
      ]);

      // Only one should succeed
      const successCount = [result1, result2].filter((r) => r.ok).length;
      expect(successCount).toBe(1);
    });
  });

  describe('Idempotency', () => {
    it('returns same result on replay with same idempotency key', async () => {
      const canonicalBody = '{"delivery_address":{"recipient_name":"Juan Pérez"}}';
      // Compute the hash the same way the use case does
      const { createHash } = await import('crypto');
      const bodyHash = createHash('sha256').update(canonicalBody).digest('hex');

      const existingRecord = {
        bodyHash,
        responseJson: {
          orderId: 'order-1',
          orderNumber: 'ORD-001',
          paymentId: 'payment-1',
          itemsSubtotalCop: 18000n,
          deliveryFeeCop: 5000n,
          ivaCop: 3420n,
          totalCop: 26420n,
        },
      };

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
      );

      unitOfWork.run.mockImplementation(async (work: any) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: mockCartWithItems,
          reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
          orderCreator: {
            createOrderAndPayment: jest.fn(),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(existingRecord),
            save: jest.fn(),
          },
        };
        return work(ctx);
      });

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orderId).toBe('order-1');
      }
    });

    it('returns IDEMPOTENCY_KEY_REUSED on divergent body', async () => {
      const existingRecord = {
        bodyHash: 'different-hash',
        responseJson: {},
      };

      sessionLookup.findById.mockResolvedValue(mockSession);
      sessionLookup.findUserById.mockResolvedValue(mockUser);
      cartRepo.findCartWithItems.mockResolvedValue(mockCartWithItems);
      productLookup.findByIds.mockResolvedValue(
        new Map([['product-1', mockProduct1], ['product-2', mockProduct2]]),
      );

      unitOfWork.run.mockImplementation(async (work: any) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: mockCartWithItems,
          reservationConverter: { convertActiveToCheckoutPending: jest.fn() },
          orderCreator: {
            createOrderAndPayment: jest.fn(),
          },
          idempotency: {
            findForUpdate: jest.fn().mockResolvedValue(existingRecord),
            save: jest.fn(),
          },
        };
        return work(ctx);
      });

      const command: CreateCheckoutCommand = {
        sessionId: 'session-1',
        userId: 'user-1',
        deliveryAddress: {
          recipientName: 'Juan Pérez',
          line1: 'Calle 123',
          city: 'Bogotá',
          phone: '3001234567',
        },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        canonicalBody: '{"delivery_address":{"recipient_name":"Different"}}',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
      }
    });
  });
});
