/**
 * Puerto de salida de repositorio de productos (Master Spec §87, AC-10).
 *
 * Productos solo soft delete en v1. `version` para optimistic locking.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface ProductRecord {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly regularPriceCop: bigint;
  readonly salePriceCop: bigint;
  readonly unit: string;
  readonly stockOnHand: number;
  readonly stockReserved: number;
  readonly version: number;
  readonly deletedAt: Date | null;
}

export interface ProductImageRecord {
  readonly id: string;
  readonly productId: string;
  readonly key: string;
  readonly altText: string;
  readonly position: number;
}

export interface ProductWithImages {
  readonly product: ProductRecord;
  readonly images: readonly ProductImageRecord[];
}

export interface ProductPage {
  readonly items: readonly ProductWithImages[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface ProductRepositoryPort {
  /** Busca un producto con imágenes por id (incluidos soft-deleted). */
  findById(productId: string): Promise<ProductWithImages | null>;

  /** Lista productos activos paginados (público). */
  listActive(page: number, size: number): Promise<ProductPage>;

  /** Lista productos activos filtrados por categoría. */
  listActiveByCategory(
    categoryId: string,
    page: number,
    size: number,
  ): Promise<ProductPage>;

  /** Busca productos activos por texto (búsqueda parcial en name/description). */
  searchActive(
    query: string,
    page: number,
    size: number,
  ): Promise<ProductPage>;

  /** Lista productos para admin (incluidos soft-deleted). */
  listAll(page: number, size: number): Promise<ProductPage>;

  /** Crea un producto con imágenes. */
  create(data: {
    readonly categoryId: string;
    readonly name: string;
    readonly description: string;
    readonly regularPriceCop: bigint;
    readonly salePriceCop: bigint;
    readonly unit: string;
    readonly stockOnHand: number;
    readonly images: readonly {
      readonly key: string;
      readonly altText: string;
      readonly position: number;
    }[];
  }): Promise<ProductWithImages>;

  /** Actualiza un producto con optimistic locking. Retorna null si version mismatch. */
  update(
    productId: string,
    expectedVersion: number,
    data: {
      readonly categoryId: string;
      readonly name: string;
      readonly description: string;
      readonly regularPriceCop: bigint;
      readonly salePriceCop: bigint;
      readonly unit: string;
      readonly images: readonly {
        readonly key: string;
        readonly altText: string;
        readonly position: number;
      }[];
    },
  ): Promise<ProductWithImages | null>;

  /** Soft delete de un producto. */
  softDelete(productId: string): Promise<boolean>;
}
