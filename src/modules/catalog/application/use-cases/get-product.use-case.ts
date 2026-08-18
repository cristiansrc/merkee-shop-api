import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ProductRepositoryPort, ProductWithImages } from '../../domain/ports/product-repository.port';
import { CategoryRepositoryPort } from '../../domain/ports/category-repository.port';
import { CatalogErrors } from '../../domain/catalog-errors';

/** Vista pública de imagen. */
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

/** Detalle de producto público. */
export interface ProductDetailView {
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

/**
 * Caso de uso: detalle de producto público.
 * GET /products/{productId} → 200 ProductResponse | 404
 */
export async function getProduct(
  productRepo: ProductRepositoryPort,
  categoryRepo: CategoryRepositoryPort,
  productId: string,
): Promise<Result<ProductDetailView, DomainError>> {
  try {
    const productWithImages = await productRepo.findById(productId);
    if (!productWithImages || productWithImages.product.deletedAt) {
      return fail(CatalogErrors.resourceNotFound());
    }

    const category = await categoryRepo.findActiveById(
      productWithImages.product.categoryId,
    );

    return ok({
      id: productWithImages.product.id,
      category: category
        ? { id: category.id, name: category.name, version: category.version }
        : { id: productWithImages.product.categoryId, name: '', version: 1 },
      name: productWithImages.product.name,
      description: productWithImages.product.description,
      regularPriceCop: Number(productWithImages.product.regularPriceCop),
      salePriceCop: Number(productWithImages.product.salePriceCop),
      unit: productWithImages.product.unit,
      stockAvailable:
        productWithImages.product.stockOnHand -
        productWithImages.product.stockReserved,
      images: productWithImages.images.map((img) => ({
        key: img.key,
        altText: img.altText,
        position: img.position,
      })),
      version: productWithImages.product.version,
    });
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}
