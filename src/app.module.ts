import { Module } from '@nestjs/common';
import { HttpModule } from './shared/http/http.module';
import { HealthModule } from './shared/http/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MediaModule } from './modules/media/media.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartReservationModule } from './modules/cart-reservation/cart-reservation.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { AdminQueryModule } from './modules/admin-query/admin-query.module';

/**
 * Módulo raíz del monolito modular hexagonal.
 *
 * El DAG de módulos (Master Spec §29 / ADR-013) es:
 * identity → media → catalog → cart-reservation → orders → payments → checkout,
 * con dependencia directa adicional checkout → cart-reservation; admin-query
 * solo lee identity/catalog/orders. En este esqueleto los módulos aún no
 * intercambian puertos entre sí; se registran para dejar el grafo visible.
 */
@Module({
  imports: [
    HttpModule,
    HealthModule,
    IdentityModule,
    MediaModule,
    CatalogModule,
    CartReservationModule,
    OrdersModule,
    PaymentsModule,
    CheckoutModule,
    AdminQueryModule,
  ],
})
export class AppModule {}
