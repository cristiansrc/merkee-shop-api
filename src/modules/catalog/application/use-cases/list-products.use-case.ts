import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ProductRepositoryPort, ProductWithImages } from '../../domain/ports/product-repository.port';

/** Vista pública de imagen de producto. */
export interface ProductImageView {
  readonly key: string;
  readonly altText: string;
  readonly position: number;
}

/** Vista pública de categoría embebida. */
export interface ProductCategoryView {
  readonly id: string;
  readonly name: string;
  readonly version: number;
}

/** Vista pública de producto. */
export interface ProductView {
  readonly id: string;
  readonly category: ProductCategoryView;
  readonly name: string;
  readonly description: string;
  readonly regularPriceCop: number;
  readonly salePriceCop: number;
  readonly unit: string;
  readonly stockAvailable: number;
  readonly images: readonly ProductImageView[];
  readonly version: number;
}

/** Resultado paginado de productos. */
export interface ListProductsResult {
  readonly items: readonly ProductView[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Consulta de entrada. */
export interface ListProductsQuery {
  readonly page: number;
  readonly size: number;
  readonly categoryId?: string;
  readonly q?: string;
}

/**
 * Caso de uso: listado público de productos activos.
 * GET /products → 200 PagedProductResponse
 *
 * Soporta paginación, filtro por category_id y búsqueda q.
 * Productos públicos excluyen soft-deleted.
 */
export async function listProducts(
  productRepo: ProductRepositoryPort,
  query: ListProductsQuery,
): Promise<Result<ListProductsResult, DomainError>> {
  try {
    let result;

    if (query.q && query.q.length >= 2) {
      result = await productRepo.searchActive(query.q, query.page, query.size);
    } else if (query.categoryId) {
      result = await productRepo.listActiveByCategory(
        query.categoryId,
        query.page,
        query.size,
      );
    } else {
      result = await productRepo.listActive(query.page, query.size);
    }

    return ok({
      items: result.items.map((p) => mapProductWithImages(p)),
      page: result.page,
      size: result.size,
      total: result.total,
    });
  } catch {
    return fail({
      code: 'TECHNICAL_DEPENDENCY_FAILURE',
      kind: 'technical',
      messageKey: 'technical.dependency.failure',
    });
  }
}

function mapProductWithImages(p: ProductWithImages): ProductView {
  return {
    id: p.product.id,
    category: { id: p.product.categoryId, name: '', version: 1 },
    name: p.product.name,
    description: p.product.description,
    regularPriceCop: Number(p.product.regularPriceCop),
    salePriceCop: Number(p.product.salePriceCop),
    unit: p.product.unit,
    stockAvailable: p.product.stockOnHand - p.product.stockReserved,
    images: p.images.map((img) => ({
      key: img.key,
      altText: img.altText,
      position: img.position,
    })),
    version: p.product.version,
  };
}
