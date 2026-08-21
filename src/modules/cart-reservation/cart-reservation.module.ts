import { Module, Provider } from '@nestjs/common';
import { CartReservationController } from './cart-reservation.controller';
import { CART_TOKENS } from './cart-reservation.tokens';
import { CartPrismaService } from './infrastructure/cart-prisma.service';
import { PrismaCartRepositoryAdapter } from './infrastructure/adapters/prisma-cart-repository.adapter';
import { PrismaStockReservationAdapter } from './infrastructure/adapters/prisma-stock-reservation.adapter';
import { PrismaProductLookupAdapter } from './infrastructure/adapters/prisma-product-lookup.adapter';
import { PrismaSessionLookupAdapter } from './infrastructure/adapters/prisma-session-lookup.adapter';
import { PrismaCartIdempotencyAdapter } from './infrastructure/adapters/prisma-cart-idempotency.adapter';
import { PrismaCartUnitOfWorkAdapter } from './infrastructure/adapters/prisma-cart-unit-of-work.adapter';
import { SystemClockAdapter } from './infrastructure/adapters/system-clock.adapter';
import { PrismaCartReaperAdapter } from './infrastructure/adapters/prisma-cart-reaper.adapter';
import { PrometheusCartReaperMetricsAdapter } from './infrastructure/adapters/prometheus-cart-reaper-metrics.adapter';
import { CartTransitionGuestToAdminAdapter } from './infrastructure/adapters/cart-transition-guest-to-admin.adapter';
import { CartSessionResolverAdapter } from './infrastructure/adapters/cart-session-resolver.adapter';
import { ScheduledCartReaperAdapter } from './infrastructure/adapters/scheduled-cart-reaper.adapter';
import { GetCartUseCase } from './application/use-cases/get-cart.use-case';
import { AddCartItemUseCase } from './application/use-cases/add-cart-item.use-case';
import { SetCartItemQuantityUseCase } from './application/use-cases/set-cart-item-quantity.use-case';
import { RemoveCartItemUseCase } from './application/use-cases/remove-cart-item.use-case';
import { ExpireCartReservationsUseCase } from './application/use-cases/expire-cart-reservations.use-case';
import { TransitionGuestToAdminUseCase } from './application/use-cases/transition-guest-to-admin.use-case';
import { CartRepositoryPort } from './domain/ports/cart-repository.port';
import { CartSessionResolverPort } from './domain/ports/cart-session-resolver.port';
import { StockReservationPort } from './domain/ports/stock-reservation.port';
import { ProductLookupPort } from './domain/ports/product-lookup.port';
import { SessionLookupPort } from './domain/ports/session-lookup.port';
import { ClockPort } from './domain/ports/clock.port';
import { CartIdempotencyPort } from './domain/ports/cart-idempotency.port';
import { CartUnitOfWorkPort } from './domain/ports/cart-unit-of-work.port';
import { CartReaperPort } from './domain/ports/cart-reaper.port';
import { CartReaperMetricsPort } from './domain/ports/cart-reaper-metrics.port';
import { CartTransitionGuestToAdminPort } from './domain/ports/cart-transition-guest-to-admin.port';

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → Prisma)
// ---------------------------------------------------------------------------

const cartRepositoryProvider: Provider = {
  provide: CART_TOKENS.CART_REPOSITORY,
  useClass: PrismaCartRepositoryAdapter,
};

const stockReservationProvider: Provider = {
  provide: CART_TOKENS.STOCK_RESERVATION,
  useClass: PrismaStockReservationAdapter,
};

const productLookupProvider: Provider = {
  provide: CART_TOKENS.PRODUCT_LOOKUP,
  useClass: PrismaProductLookupAdapter,
};

const sessionLookupProvider: Provider = {
  provide: CART_TOKENS.SESSION_LOOKUP,
  useClass: PrismaSessionLookupAdapter,
};

const clockProvider: Provider = {
  provide: CART_TOKENS.CLOCK,
  useClass: SystemClockAdapter,
};

const idempotencyProvider: Provider = {
  provide: CART_TOKENS.IDEMPOTENCY,
  useClass: PrismaCartIdempotencyAdapter,
};

const unitOfWorkProvider: Provider = {
  provide: CART_TOKENS.UNIT_OF_WORK,
  useClass: PrismaCartUnitOfWorkAdapter,
};

const reaperProvider: Provider = {
  provide: CART_TOKENS.REAPER,
  useClass: PrismaCartReaperAdapter,
};

const reaperMetricsProvider: Provider = {
  provide: CART_TOKENS.REAPER_METRICS,
  useClass: PrometheusCartReaperMetricsAdapter,
};

const transitionGuestToAdminProvider: Provider = {
  provide: CART_TOKENS.TRANSITION_GUEST_TO_ADMIN,
  useFactory: (
    cartRepo: CartRepositoryPort,
    stockReservation: StockReservationPort,
  ): CartTransitionGuestToAdminPort =>
    new CartTransitionGuestToAdminAdapter(cartRepo, stockReservation),
  inject: [CART_TOKENS.CART_REPOSITORY, CART_TOKENS.STOCK_RESERVATION],
};

const sessionResolverProvider: Provider = {
  provide: CART_TOKENS.SESSION_RESOLVER,
  useClass: CartSessionResolverAdapter,
};

// ---------------------------------------------------------------------------
// Providers de use cases
// ---------------------------------------------------------------------------

const getCartUseCaseProvider: Provider = {
  provide: CART_TOKENS.GET_CART_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    sessionLookup: SessionLookupPort,
    productLookup: ProductLookupPort,
    clock: ClockPort,
  ): GetCartUseCase =>
    new GetCartUseCase(cartRepo, sessionLookup, productLookup, clock),
  inject: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.SESSION_LOOKUP,
    CART_TOKENS.PRODUCT_LOOKUP,
    CART_TOKENS.CLOCK,
  ],
};

const addCartItemUseCaseProvider: Provider = {
  provide: CART_TOKENS.ADD_CART_ITEM_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    sessionLookup: SessionLookupPort,
    productLookup: ProductLookupPort,
    clock: ClockPort,
    idempotency: CartIdempotencyPort,
    unitOfWork: CartUnitOfWorkPort,
  ): AddCartItemUseCase =>
    new AddCartItemUseCase(
      cartRepo,
      sessionLookup,
      productLookup,
      clock,
      idempotency,
      unitOfWork,
    ),
  inject: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.SESSION_LOOKUP,
    CART_TOKENS.PRODUCT_LOOKUP,
    CART_TOKENS.CLOCK,
    CART_TOKENS.IDEMPOTENCY,
    CART_TOKENS.UNIT_OF_WORK,
  ],
};

const setCartItemQuantityUseCaseProvider: Provider = {
  provide: CART_TOKENS.SET_CART_ITEM_QUANTITY_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    sessionLookup: SessionLookupPort,
    productLookup: ProductLookupPort,
    clock: ClockPort,
    idempotency: CartIdempotencyPort,
    unitOfWork: CartUnitOfWorkPort,
  ): SetCartItemQuantityUseCase =>
    new SetCartItemQuantityUseCase(
      cartRepo,
      sessionLookup,
      productLookup,
      clock,
      idempotency,
      unitOfWork,
    ),
  inject: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.SESSION_LOOKUP,
    CART_TOKENS.PRODUCT_LOOKUP,
    CART_TOKENS.CLOCK,
    CART_TOKENS.IDEMPOTENCY,
    CART_TOKENS.UNIT_OF_WORK,
  ],
};

const removeCartItemUseCaseProvider: Provider = {
  provide: CART_TOKENS.REMOVE_CART_ITEM_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    sessionLookup: SessionLookupPort,
    productLookup: ProductLookupPort,
    clock: ClockPort,
    idempotency: CartIdempotencyPort,
    unitOfWork: CartUnitOfWorkPort,
  ): RemoveCartItemUseCase =>
    new RemoveCartItemUseCase(
      cartRepo,
      sessionLookup,
      productLookup,
      clock,
      idempotency,
      unitOfWork,
    ),
  inject: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.SESSION_LOOKUP,
    CART_TOKENS.PRODUCT_LOOKUP,
    CART_TOKENS.CLOCK,
    CART_TOKENS.IDEMPOTENCY,
    CART_TOKENS.UNIT_OF_WORK,
  ],
};

const expireCartReservationsUseCaseProvider: Provider = {
  provide: CART_TOKENS.EXPIRE_CART_RESERVATIONS_USE_CASE,
  useFactory: (
    reaper: CartReaperPort,
    metrics: CartReaperMetricsPort,
    clock: ClockPort,
  ): ExpireCartReservationsUseCase =>
    new ExpireCartReservationsUseCase(reaper, metrics, clock),
  inject: [
    CART_TOKENS.REAPER,
    CART_TOKENS.REAPER_METRICS,
    CART_TOKENS.CLOCK,
  ],
};

const transitionGuestToAdminUseCaseProvider: Provider = {
  provide: CART_TOKENS.TRANSITION_GUEST_TO_ADMIN_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    stockReservation: StockReservationPort,
  ): TransitionGuestToAdminUseCase =>
    new TransitionGuestToAdminUseCase(cartRepo, stockReservation),
  inject: [CART_TOKENS.CART_REPOSITORY, CART_TOKENS.STOCK_RESERVATION],
};

const scheduledReaperProvider: Provider = {
  provide: ScheduledCartReaperAdapter,
  useFactory: (
    expireUseCase: ExpireCartReservationsUseCase,
  ): ScheduledCartReaperAdapter => {
    const enabled =
      process.env.CART_REAPER_SCHEDULE_ENABLED !== 'false';
    const intervalMs = process.env.CART_REAPER_INTERVAL_MS
      ? parseInt(process.env.CART_REAPER_INTERVAL_MS, 10)
      : 60_000;
    const adapter = new ScheduledCartReaperAdapter(expireUseCase, {
      enabled,
      intervalMs,
    });
    adapter.start();
    return adapter;
  },
  inject: [CART_TOKENS.EXPIRE_CART_RESERVATIONS_USE_CASE],
};

/**
 * Módulo `cart-reservation` (Master Spec AC-02, AC-03, AC-04, AC-11 /
 * ADR-008, ADR-014).
 *
 * Carrito de servidor para guest/cliente y reserva de stock atómica.
 * Reserva locks por product_id ASC; sesión/carrito/reservas ACTIVE
 * renuevan 10m por acción válida; admin recibe 403.
 */
@Module({
  controllers: [CartReservationController],
  providers: [
    CartPrismaService,
    // Adapters de salida
    cartRepositoryProvider,
    stockReservationProvider,
    productLookupProvider,
    sessionLookupProvider,
    clockProvider,
    idempotencyProvider,
    unitOfWorkProvider,
    reaperProvider,
    reaperMetricsProvider,
    transitionGuestToAdminProvider,
    sessionResolverProvider,
    // Use cases
    getCartUseCaseProvider,
    addCartItemUseCaseProvider,
    setCartItemQuantityUseCaseProvider,
    removeCartItemUseCaseProvider,
    expireCartReservationsUseCaseProvider,
    transitionGuestToAdminUseCaseProvider,
    // Scheduler
    scheduledReaperProvider,
  ],
  exports: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.STOCK_RESERVATION,
    CART_TOKENS.SESSION_LOOKUP,
    CART_TOKENS.CLOCK,
    CART_TOKENS.SESSION_RESOLVER,
    CART_TOKENS.TRANSITION_GUEST_TO_ADMIN,
    CART_TOKENS.IDEMPOTENCY,
  ],
})
export class CartReservationModule {}
