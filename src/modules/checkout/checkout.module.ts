import { Module, Provider } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CHECKOUT_TOKENS } from './checkout.tokens';
import { CartPrismaService } from '../cart-reservation/infrastructure/cart-prisma.service';
import { CheckoutReservationAdapter } from './infrastructure/adapters/checkout-reservation.adapter';
import { PrismaCheckoutUnitOfWorkAdapter } from './infrastructure/adapters/checkout-unit-of-work.adapter';
import { CheckoutProductLookupAdapter } from './infrastructure/adapters/checkout-product-lookup.adapter';
import { CreateCheckoutUseCaseImpl } from './application/use-cases/create-checkout.use-case';
import { CheckoutReservationPort } from './domain/ports/checkout-reservation.port';
import { CheckoutUnitOfWorkPort } from './domain/ports/checkout-unit-of-work.port';
import { CheckoutProductLookupPort } from './domain/ports/checkout-product-lookup.port';
import { CartRepositoryPort } from '../cart-reservation/domain/ports/cart-repository.port';
import { StockReservationPort } from '../cart-reservation/domain/ports/stock-reservation.port';
import { SessionLookupPort } from '../cart-reservation/domain/ports/session-lookup.port';
import { CART_TOKENS } from '../cart-reservation/cart-reservation.tokens';
import { CartReservationModule } from '../cart-reservation/cart-reservation.module';

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → Prisma)
// ---------------------------------------------------------------------------

const checkoutReservationProvider: Provider = {
  provide: CHECKOUT_TOKENS.CHECKOUT_RESERVATION,
  useClass: CheckoutReservationAdapter,
};

const checkoutUnitOfWorkProvider: Provider = {
  provide: CHECKOUT_TOKENS.CHECKOUT_UNIT_OF_WORK,
  useClass: PrismaCheckoutUnitOfWorkAdapter,
};

const checkoutProductLookupProvider: Provider = {
  provide: CHECKOUT_TOKENS.CHECKOUT_PRODUCT_LOOKUP,
  useClass: CheckoutProductLookupAdapter,
};

// ---------------------------------------------------------------------------
// Providers de use cases
// ---------------------------------------------------------------------------

const createCheckoutUseCaseProvider: Provider = {
  provide: CHECKOUT_TOKENS.CREATE_CHECKOUT_USE_CASE,
  useFactory: (
    cartRepo: CartRepositoryPort,
    sessionLookup: SessionLookupPort,
    productLookup: CheckoutProductLookupPort,
    unitOfWork: CheckoutUnitOfWorkPort,
  ): CreateCheckoutUseCaseImpl =>
    new CreateCheckoutUseCaseImpl(cartRepo, sessionLookup, productLookup, unitOfWork),
  inject: [
    CART_TOKENS.CART_REPOSITORY,
    CART_TOKENS.SESSION_LOOKUP,
    CHECKOUT_TOKENS.CHECKOUT_PRODUCT_LOOKUP,
    CHECKOUT_TOKENS.CHECKOUT_UNIT_OF_WORK,
  ],
};

/**
 * Módulo `checkout` (Master Spec AC-08 / ADR-009).
 *
 * Convierte reservas ACTIVE en CHECKOUT_PENDING usando los puertos de
 * `cart-reservation` (dependencia directa checkout → cart-reservation,
 * ADR-013). Crea orden + pago pending idempotente.
 */
@Module({
  imports: [CartReservationModule],
  controllers: [CheckoutController],
  providers: [
    CartPrismaService,
    // Adapters de salida
    checkoutReservationProvider,
    checkoutUnitOfWorkProvider,
    checkoutProductLookupProvider,
    // Use cases
    createCheckoutUseCaseProvider,
  ],
  exports: [
    CHECKOUT_TOKENS.CREATE_CHECKOUT_USE_CASE,
  ],
})
export class CheckoutModule {}
