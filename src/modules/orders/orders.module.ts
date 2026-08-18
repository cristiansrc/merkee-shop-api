import { Module, Provider } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ORDERS_TOKENS } from './orders.tokens';
import { CartPrismaService } from '../cart-reservation/infrastructure/cart-prisma.service';
import { OrderRepositoryAdapter } from './infrastructure/adapters/order-repository.adapter';
import { ListOrdersUseCaseImpl } from './application/use-cases/list-orders.use-case';
import { OrderRepositoryPort } from './domain/ports/order-repository.port';
import { CartReservationModule } from '../cart-reservation/cart-reservation.module';

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → Prisma)
// ---------------------------------------------------------------------------

const orderRepositoryProvider: Provider = {
  provide: ORDERS_TOKENS.ORDER_REPOSITORY,
  useClass: OrderRepositoryAdapter,
};

// ---------------------------------------------------------------------------
// Providers de use cases
// ---------------------------------------------------------------------------

const listOrdersUseCaseProvider: Provider = {
  provide: ORDERS_TOKENS.LIST_ORDERS_USE_CASE,
  useFactory: (orderRepo: OrderRepositoryPort): ListOrdersUseCaseImpl =>
    new ListOrdersUseCaseImpl(orderRepo),
  inject: [ORDERS_TOKENS.ORDER_REPOSITORY],
};

/**
 * Módulo `orders` (Master Spec AC-08 / ADR-009).
 *
 * Snapshots de orden y paginación de órdenes propias.
 */
@Module({
  imports: [CartReservationModule],
  controllers: [OrdersController],
  providers: [
    CartPrismaService,
    // Adapters de salida
    orderRepositoryProvider,
    // Use cases
    listOrdersUseCaseProvider,
  ],
  exports: [
    ORDERS_TOKENS.LIST_ORDERS_USE_CASE,
  ],
})
export class OrdersModule {}
