import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { Result, isSuccess } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import { TransportValidationPipe } from '../../shared/http/transport-validation.pipe';
import { TransportAuthGuard } from '../../shared/http/transport-auth.guard';
import { projectResult } from '../../shared/http/result-projector';
import { resolveMediaPublicUrl } from '../../shared/http/media-url';
import {
  validateCategoryWriteRequest,
  validateProductWriteRequest,
  validateProductUpdateRequest,
  validateBannerWriteRequest,
  validateStockAdjustmentRequest,
} from '../../contract/validation/request-validators';
import {
  validateIdempotencyKey,
  validateIfMatch,
} from '../../contract/validation/header-validators';
import { CATALOG_TOKENS } from './catalog.tokens';
import { CategoryRepositoryPort } from './domain/ports/category-repository.port';
import { ProductRepositoryPort } from './domain/ports/product-repository.port';
import { BannerRepositoryPort } from './domain/ports/banner-repository.port';
import { CatalogIdempotencyPort } from './domain/ports/catalog-idempotency.port';
import { ActorLookupPort } from './domain/ports/actor-lookup.port';
import { StockAdjustmentRepositoryPort } from './domain/ports/stock-adjustment-repository.port';
import { StockAdjustmentProductLockPort } from './domain/ports/stock-adjustment-product-lock.port';

// Use cases
import { listCategories } from './application/use-cases/list-categories.use-case';
import { listProducts } from './application/use-cases/list-products.use-case';
import { getProduct } from './application/use-cases/get-product.use-case';
import { listActiveBanners } from './application/use-cases/list-active-banners.use-case';
import {
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  AdminCreateCategoryView,
} from './application/use-cases/admin-category.use-cases';
import {
  adminListProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  AdminProductView,
  AdminListProductsResult,
} from './application/use-cases/admin-product.use-cases';
import {
  adminListBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
  AdminBannerView,
} from './application/use-cases/admin-banner.use-cases';
import {
  adminCreateStockAdjustment,
  StockAdjustmentView,
} from './application/use-cases/admin-stock-adjustment.use-case';
import { CategoryView } from './application/use-cases/list-categories.use-case';
import { ListProductsResult, ProductView } from './application/use-cases/list-products.use-case';
import { ProductDetailView } from './application/use-cases/get-product.use-case';
import { BannerView } from './application/use-cases/list-active-banners.use-case';

// Validated body types
interface ValidatedCategoryBody {
  readonly name: string;
  readonly image_key: string;
}

interface ValidatedProductBody {
  readonly category_id: string;
  readonly name: string;
  readonly description: string;
  readonly regular_price_cop: number;
  readonly sale_price_cop: number;
  readonly unit: string;
  readonly stock_on_hand?: number;
  readonly images: readonly { readonly key: string; readonly alt_text: string; readonly position: number }[];
}

interface ValidatedProductUpdateBody {
  readonly category_id: string;
  readonly name: string;
  readonly description: string;
  readonly regular_price_cop: number;
  readonly sale_price_cop: number;
  readonly unit: string;
  readonly images: readonly { readonly key: string; readonly alt_text: string; readonly position: number }[];
}

interface ValidatedBannerBody {
  readonly name: string;
  readonly image_key: string;
  readonly target_path?: string | null;
  readonly display_order: number;
  readonly active: boolean;
}

interface ValidatedStockAdjustmentBody {
  readonly quantity_delta: number;
  readonly reason: string;
}

interface AuthenticatedActor {
  readonly id: string;
}

function getActor(req: Request): AuthenticatedActor | null {
  const u = (req as Request & { user?: { id?: string } }).user;
  if (!u || !u.id) return null;
  return { id: u.id };
}

function getTraceId(req: Request): string {
  return (typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id']
    : 'catalog') ?? 'catalog';
}

function requireIdempotencyKey(
  value: string | undefined,
  path: string,
  traceId: string,
): asserts value is string {
  const check = validateIdempotencyKey(value);
  if (!check.valid || typeof value !== 'string') {
    throw projectResult(
      { ok: false, error: { code: 'INVALID_DOMAIN_INPUT', kind: 'validation', messageKey: 'invalid.input' } } as Result<never, DomainError>,
      path,
      traceId,
    );
  }
}

function requireIfMatch(
  value: string | undefined,
  path: string,
  traceId: string,
): number {
  const check = validateIfMatch(value);
  if (!check.valid || typeof value !== 'string') {
    throw projectResult(
      { ok: false, error: { code: 'INVALID_DOMAIN_INPUT', kind: 'validation', messageKey: 'invalid.input' } } as Result<never, DomainError>,
      path,
      traceId,
    );
  }
  return parseInt(value, 10);
}

function mapCategoryResponse(c: CategoryView) {
  return {
    id: c.id,
    name: c.name,
    image: { key: c.imageKey, url: resolveMediaPublicUrl(c.imageKey), alt_text: '', position: 0 },
    version: c.version,
  };
}

function mapProductResponse(p: ProductView) {
  return {
    id: p.id,
    category: { id: p.category.id, name: p.category.name, image: { key: '', url: '', alt_text: '', position: 0 }, version: p.category.version },
    name: p.name,
    description: p.description,
    regular_price_cop: p.regularPriceCop,
    sale_price_cop: p.salePriceCop,
    unit: p.unit,
    stock_available: p.stockAvailable,
    images: p.images.map((img) => ({ key: img.key, url: resolveMediaPublicUrl(img.key), alt_text: img.altText, position: img.position })),
    version: p.version,
  };
}

function mapProductDetailResponse(p: ProductDetailView) {
  return {
    id: p.id,
    category: { id: p.category.id, name: p.category.name, image: { key: '', url: '', alt_text: '', position: 0 }, version: p.category.version },
    name: p.name,
    description: p.description,
    regular_price_cop: p.regularPriceCop,
    sale_price_cop: p.salePriceCop,
    unit: p.unit,
    stock_available: p.stockAvailable,
    images: p.images.map((img) => ({ key: img.key, url: resolveMediaPublicUrl(img.key), alt_text: img.altText, position: img.position })),
    version: p.version,
  };
}

function mapBannerResponse(b: BannerView) {
  return {
    id: b.id,
    name: b.name,
    image: { key: b.imageKey, url: resolveMediaPublicUrl(b.imageKey), alt_text: '', position: 0 },
    target_path: b.targetPath,
    display_order: b.displayOrder,
    active: b.active,
    version: b.version,
  };
}

function mapAdminCategoryResponse(c: AdminCreateCategoryView) {
  return {
    id: c.id,
    name: c.name,
    image: { key: c.imageKey, url: resolveMediaPublicUrl(c.imageKey), alt_text: '', position: 0 },
    version: c.version,
  };
}

function mapAdminProductResponse(p: AdminProductView) {
  return {
    id: p.id,
    category: { id: p.categoryId, name: '', image: { key: '', url: '', alt_text: '', position: 0 }, version: 1 },
    name: p.name,
    description: p.description,
    regular_price_cop: p.regularPriceCop,
    sale_price_cop: p.salePriceCop,
    unit: p.unit,
    stock_on_hand: p.stockOnHand,
    stock_reserved: p.stockReserved,
    stock_available: p.stockOnHand - p.stockReserved,
    images: p.images.map((img) => ({ key: img.key, url: resolveMediaPublicUrl(img.key), alt_text: img.altText, position: img.position })),
    version: p.version,
  };
}

function mapAdminBannerResponse(b: AdminBannerView) {
  return {
    id: b.id,
    name: b.name,
    image: { key: b.imageKey, url: resolveMediaPublicUrl(b.imageKey), alt_text: '', position: 0 },
    target_path: b.targetPath,
    display_order: b.displayOrder,
    active: b.active,
    version: b.version,
  };
}

function mapStockAdjustmentResponse(s: StockAdjustmentView) {
  return {
    id: s.id,
    product_id: s.product_id,
    quantity_delta: s.quantity_delta,
    reason: s.reason,
    stock_on_hand_before: s.stock_on_hand_before,
    stock_on_hand_after: s.stock_on_hand_after,
    stock_reserved: s.stock_reserved,
    stock_available: s.stock_available,
    created_at: s.created_at,
  };
}

/**
 * Adapter de entrada HTTP del módulo `catalog` (MSF-CAT-002).
 *
 * Endpoints públicos (sin auth):
 *  - GET /categories → 200
 *  - GET /products → 200 (paginado, q, category_id)
 *  - GET /products/:productId → 200 | 404
 *  - GET /banners → 200
 *
 * Endpoints admin (auth requerida):
 *  - CRUD categorías, productos y banners
 */
@Controller()
export class CatalogController {
  constructor(
    @Inject(CATALOG_TOKENS.CATEGORY_REPOSITORY)
    private readonly categoryRepo: CategoryRepositoryPort,
    @Inject(CATALOG_TOKENS.PRODUCT_REPOSITORY)
    private readonly productRepo: ProductRepositoryPort,
    @Inject(CATALOG_TOKENS.BANNER_REPOSITORY)
    private readonly bannerRepo: BannerRepositoryPort,
    @Inject(CATALOG_TOKENS.CATALOG_IDEMPOTENCY)
    private readonly idempotencyPort: CatalogIdempotencyPort,
    @Inject(CATALOG_TOKENS.ACTOR_LOOKUP)
    private readonly actorLookup: ActorLookupPort,
    @Inject(CATALOG_TOKENS.STOCK_ADJUSTMENT_REPOSITORY)
    private readonly stockAdjustmentRepo: StockAdjustmentRepositoryPort,
    @Inject(CATALOG_TOKENS.STOCK_ADJUSTMENT_PRODUCT_LOCK)
    private readonly productLockPort: StockAdjustmentProductLockPort,
  ) {}

  // ─── Public endpoints ──────────────────────────────────────────────

  @Get('categories')
  async listCategories(@Req() req: Request) {
    const path = '/categories';
    const traceId = getTraceId(req);
    const result = await listCategories(this.categoryRepo);
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return result.value.map(mapCategoryResponse);
  }

  @Get('products')
  async listProducts(
    @Query('page') page: string | undefined,
    @Query('size') size: string | undefined,
    @Query('category_id') categoryId: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: Request,
  ) {
    const path = '/products';
    const traceId = getTraceId(req);
    const result = await listProducts(this.productRepo, {
      page: page ? parseInt(page, 10) || 1 : 1,
      size: size ? Math.min(Math.max(parseInt(size, 10) || 20, 1), 100) : 20,
      categoryId,
      q,
    });
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    const data = result.value as ListProductsResult;
    return {
      items: data.items.map(mapProductResponse),
      page: { page: data.page, size: data.size, total: data.total },
    };
  }

  @Get('products/:productId')
  async getProduct(
    @Param('productId') productId: string,
    @Req() req: Request,
  ) {
    const path = `/products/${productId}`;
    const traceId = getTraceId(req);
    const result = await getProduct(this.productRepo, this.categoryRepo, productId);
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapProductDetailResponse(result.value as ProductDetailView);
  }

  @Get('banners')
  async listActiveBanners(@Req() req: Request) {
    const path = '/banners';
    const traceId = getTraceId(req);
    const result = await listActiveBanners(this.bannerRepo);
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return (result.value as readonly BannerView[]).map(mapBannerResponse);
  }

  // ─── Admin: Categories ─────────────────────────────────────────────

  @Get('admin/categories')
  @UseGuards(TransportAuthGuard)
  async adminListCategories(@Req() req: Request) {
    const path = '/admin/categories';
    const traceId = getTraceId(req);
    const result = await adminListCategories(this.categoryRepo);
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return (result.value as readonly AdminCreateCategoryView[]).map(mapAdminCategoryResponse);
  }

  @Post('admin/categories')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TransportAuthGuard)
  async adminCreateCategory(
    @Body(new TransportValidationPipe(validateCategoryWriteRequest))
    body: ValidatedCategoryBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = '/admin/categories';
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminCreateCategory(
      this.categoryRepo,
      this.actorLookup,
      this.idempotencyPort,
      { actorId: actor?.id ?? '', idempotencyKey, name: body.name, imageKey: body.image_key },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminCategoryResponse(result.value as AdminCreateCategoryView);
  }

  @Patch('admin/categories/:categoryId')
  @UseGuards(TransportAuthGuard)
  async adminUpdateCategory(
    @Param('categoryId') categoryId: string,
    @Body(new TransportValidationPipe(validateCategoryWriteRequest))
    body: ValidatedCategoryBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/categories/${categoryId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    const expectedVersion = requireIfMatch(ifMatch, path, traceId);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminUpdateCategory(
      this.categoryRepo,
      this.actorLookup,
      this.idempotencyPort,
      { actorId: actor?.id ?? '', categoryId, expectedVersion, idempotencyKey, name: body.name, imageKey: body.image_key },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminCategoryResponse(result.value as AdminCreateCategoryView);
  }

  @Delete('admin/categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TransportAuthGuard)
  async adminDeleteCategory(
    @Param('categoryId') categoryId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/categories/${categoryId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminDeleteCategory(
      this.categoryRepo,
      this.actorLookup,
      this.idempotencyPort,
      { actorId: actor?.id ?? '', categoryId, idempotencyKey },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
  }

  // ─── Admin: Products ───────────────────────────────────────────────

  @Get('admin/products')
  @UseGuards(TransportAuthGuard)
  async adminListProducts(
    @Query('page') page: string | undefined,
    @Query('size') size: string | undefined,
    @Req() req: Request,
  ) {
    const path = '/admin/products';
    const traceId = getTraceId(req);
    const result = await adminListProducts(
      this.productRepo,
      page ? parseInt(page, 10) || 1 : 1,
      size ? Math.min(Math.max(parseInt(size, 10) || 20, 1), 100) : 20,
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    const data = result.value as AdminListProductsResult;
    return {
      items: data.items.map(mapAdminProductResponse),
      page: { page: data.page, size: data.size, total: data.total },
    };
  }

  @Post('admin/products')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TransportAuthGuard)
  async adminCreateProduct(
    @Body(new TransportValidationPipe(validateProductWriteRequest))
    body: ValidatedProductBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = '/admin/products';
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminCreateProduct(
      this.productRepo,
      this.actorLookup,
      this.idempotencyPort,
      {
        actorId: actor?.id ?? '',
        idempotencyKey,
        categoryId: body.category_id,
        name: body.name,
        description: body.description,
        regularPriceCop: body.regular_price_cop,
        salePriceCop: body.sale_price_cop,
        unit: body.unit,
        stockOnHand: body.stock_on_hand ?? 0,
        images: body.images.map((img) => ({ key: img.key, altText: img.alt_text, position: img.position })),
      },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminProductResponse(result.value as AdminProductView);
  }

  @Patch('admin/products/:productId')
  @UseGuards(TransportAuthGuard)
  async adminUpdateProduct(
    @Param('productId') productId: string,
    @Body(new TransportValidationPipe(validateProductUpdateRequest))
    body: ValidatedProductUpdateBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/products/${productId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    const expectedVersion = requireIfMatch(ifMatch, path, traceId);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminUpdateProduct(
      this.productRepo,
      this.actorLookup,
      this.idempotencyPort,
      {
        actorId: actor?.id ?? '',
        productId,
        expectedVersion,
        idempotencyKey,
        categoryId: body.category_id,
        name: body.name,
        description: body.description,
        regularPriceCop: body.regular_price_cop,
        salePriceCop: body.sale_price_cop,
        unit: body.unit,
        images: body.images.map((img) => ({ key: img.key, altText: img.alt_text, position: img.position })),
      },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminProductResponse(result.value as AdminProductView);
  }

  @Delete('admin/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TransportAuthGuard)
  async adminDeleteProduct(
    @Param('productId') productId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/products/${productId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminDeleteProduct(
      this.productRepo,
      this.actorLookup,
      this.idempotencyPort,
      { actorId: actor?.id ?? '', productId, idempotencyKey },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
  }

  // ─── Admin: Stock Adjustment ────────────────────────────────────────

  @Post('admin/products/:productId/stock-adjustments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TransportAuthGuard)
  async adminCreateStockAdjustment(
    @Param('productId') productId: string,
    @Body(new TransportValidationPipe(validateStockAdjustmentRequest))
    body: ValidatedStockAdjustmentBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/products/${productId}/stock-adjustments`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminCreateStockAdjustment(
      this.actorLookup,
      this.idempotencyPort,
      this.productLockPort,
      this.stockAdjustmentRepo,
      {
        actorId: actor?.id ?? '',
        productId,
        idempotencyKey,
        quantityDelta: body.quantity_delta,
        reason: body.reason,
      },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapStockAdjustmentResponse(result.value as StockAdjustmentView);
  }

  // ─── Admin: Banners ────────────────────────────────────────────────

  @Get('admin/banners')
  @UseGuards(TransportAuthGuard)
  async adminListBanners(@Req() req: Request) {
    const path = '/admin/banners';
    const traceId = getTraceId(req);
    const result = await adminListBanners(this.bannerRepo);
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return (result.value as readonly AdminBannerView[]).map(mapAdminBannerResponse);
  }

  @Post('admin/banners')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TransportAuthGuard)
  async adminCreateBanner(
    @Body(new TransportValidationPipe(validateBannerWriteRequest))
    body: ValidatedBannerBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = '/admin/banners';
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminCreateBanner(
      this.bannerRepo,
      this.actorLookup,
      this.idempotencyPort,
      {
        actorId: actor?.id ?? '',
        idempotencyKey,
        name: body.name,
        imageKey: body.image_key,
        targetPath: body.target_path ?? null,
        displayOrder: body.display_order,
        active: body.active,
      },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminBannerResponse(result.value as AdminBannerView);
  }

  @Patch('admin/banners/:bannerId')
  @UseGuards(TransportAuthGuard)
  async adminUpdateBanner(
    @Param('bannerId') bannerId: string,
    @Body(new TransportValidationPipe(validateBannerWriteRequest))
    body: ValidatedBannerBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/banners/${bannerId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    const expectedVersion = requireIfMatch(ifMatch, path, traceId);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminUpdateBanner(
      this.bannerRepo,
      this.actorLookup,
      this.idempotencyPort,
      {
        actorId: actor?.id ?? '',
        bannerId,
        expectedVersion,
        idempotencyKey,
        name: body.name,
        imageKey: body.image_key,
        targetPath: body.target_path ?? null,
        displayOrder: body.display_order,
        active: body.active,
      },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return mapAdminBannerResponse(result.value as AdminBannerView);
  }

  @Delete('admin/banners/:bannerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TransportAuthGuard)
  async adminDeleteBanner(
    @Param('bannerId') bannerId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const path = `/admin/banners/${bannerId}`;
    const traceId = getTraceId(req);
    const actor = getActor(req);
    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await adminDeleteBanner(
      this.bannerRepo,
      this.actorLookup,
      this.idempotencyPort,
      { actorId: actor?.id ?? '', bannerId, idempotencyKey },
    );
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
  }
}
