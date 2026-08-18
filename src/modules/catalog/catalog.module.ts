import { Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../cart-reservation/infrastructure/prisma.module';
import { CATALOG_TOKENS } from './catalog.tokens';
import { CatalogController } from './catalog.controller';
import { PrismaCategoryRepositoryAdapter } from './infrastructure/adapters/prisma-category-repository.adapter';
import { PrismaProductRepositoryAdapter } from './infrastructure/adapters/prisma-product-repository.adapter';
import { PrismaBannerRepositoryAdapter } from './infrastructure/adapters/prisma-banner-repository.adapter';
import { PrismaCatalogIdempotencyAdapter } from './infrastructure/adapters/prisma-catalog-idempotency.adapter';
import { PrismaActorLookupAdapter } from './infrastructure/adapters/prisma-actor-lookup.adapter';
import { PrismaStockAdjustmentRepositoryAdapter } from './infrastructure/adapters/prisma-stock-adjustment-repository.adapter';
import { PrismaStockAdjustmentProductLockAdapter } from './infrastructure/adapters/prisma-stock-adjustment-product-lock.adapter';

const categoryRepositoryProvider: Provider = {
  provide: CATALOG_TOKENS.CATEGORY_REPOSITORY,
  useClass: PrismaCategoryRepositoryAdapter,
};

const productRepositoryProvider: Provider = {
  provide: CATALOG_TOKENS.PRODUCT_REPOSITORY,
  useClass: PrismaProductRepositoryAdapter,
};

const bannerRepositoryProvider: Provider = {
  provide: CATALOG_TOKENS.BANNER_REPOSITORY,
  useClass: PrismaBannerRepositoryAdapter,
};

const catalogIdempotencyProvider: Provider = {
  provide: CATALOG_TOKENS.CATALOG_IDEMPOTENCY,
  useClass: PrismaCatalogIdempotencyAdapter,
};

const actorLookupProvider: Provider = {
  provide: CATALOG_TOKENS.ACTOR_LOOKUP,
  useClass: PrismaActorLookupAdapter,
};

const stockAdjustmentRepositoryProvider: Provider = {
  provide: CATALOG_TOKENS.STOCK_ADJUSTMENT_REPOSITORY,
  useClass: PrismaStockAdjustmentRepositoryAdapter,
};

const stockAdjustmentProductLockProvider: Provider = {
  provide: CATALOG_TOKENS.STOCK_ADJUSTMENT_PRODUCT_LOCK,
  useClass: PrismaStockAdjustmentProductLockAdapter,
};

/**
 * Módulo `catalog` (Master Spec AC-01, AC-09, AC-10 / ADR-011, ADR-012).
 *
 * Categorías, productos, banners, paginación pública/admin con soft delete
 * y ajuste administrativo de stock auditado e idempotente.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [
    categoryRepositoryProvider,
    productRepositoryProvider,
    bannerRepositoryProvider,
    catalogIdempotencyProvider,
    actorLookupProvider,
    stockAdjustmentRepositoryProvider,
    stockAdjustmentProductLockProvider,
  ],
  exports: [
    CATALOG_TOKENS.CATEGORY_REPOSITORY,
    CATALOG_TOKENS.PRODUCT_REPOSITORY,
    CATALOG_TOKENS.BANNER_REPOSITORY,
  ],
})
export class CatalogModule {}
