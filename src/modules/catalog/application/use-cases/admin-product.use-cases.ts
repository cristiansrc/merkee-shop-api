import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ProductRepositoryPort, ProductWithImages } from '../../domain/ports/product-repository.port';
import { ActorLookupPort } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { CatalogErrors } from '../../domain/catalog-errors';
import { createHash } from 'crypto';

export interface AdminProductView {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly regularPriceCop: number;
  readonly salePriceCop: number;
  readonly unit: string;
  readonly stockOnHand: number;
  readonly stockReserved: number;
  readonly version: number;
  readonly images: readonly { readonly key: string; readonly altText: string; readonly position: number }[];
}

export interface AdminListProductsResult {
  readonly items: readonly AdminProductView[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export async function adminListProducts(
  productRepo: ProductRepositoryPort,
  page: number,
  size: number,
): Promise<Result<AdminListProductsResult, DomainError>> {
  try {
    const result = await productRepo.listAll(page, size);
    return ok({
      items: result.items.map((p) => ({
        id: p.product.id,
        categoryId: p.product.categoryId,
        name: p.product.name,
        description: p.product.description,
        regularPriceCop: Number(p.product.regularPriceCop),
        salePriceCop: Number(p.product.salePriceCop),
        unit: p.product.unit,
        stockOnHand: p.product.stockOnHand,
        stockReserved: p.product.stockReserved,
        version: p.product.version,
        images: p.images.map((img) => ({ key: img.key, altText: img.altText, position: img.position })),
      })),
      page: result.page,
      size: result.size,
      total: result.total,
    });
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}

export interface AdminCreateProductCommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly regularPriceCop: number;
  readonly salePriceCop: number;
  readonly unit: string;
  readonly stockOnHand: number;
  readonly images: readonly { readonly key: string; readonly altText: string; readonly position: number }[];
}

export async function adminCreateProduct(
  productRepo: ProductRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminCreateProductCommand,
): Promise<Result<AdminProductView, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-product-create:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        category_id: command.categoryId,
        name: command.name,
        description: command.description,
        regular_price_cop: command.regularPriceCop,
        sale_price_cop: command.salePriceCop,
        unit: command.unit,
        stock_on_hand: command.stockOnHand,
        images: command.images,
      }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as AdminProductView);
    }

    const created = await productRepo.create({
      categoryId: command.categoryId,
      name: command.name,
      description: command.description,
      regularPriceCop: BigInt(command.regularPriceCop),
      salePriceCop: BigInt(command.salePriceCop),
      unit: command.unit,
      stockOnHand: command.stockOnHand,
      images: command.images,
    });

    const response: AdminProductView = {
      id: created.product.id,
      categoryId: created.product.categoryId,
      name: created.product.name,
      description: created.product.description,
      regularPriceCop: Number(created.product.regularPriceCop),
      salePriceCop: Number(created.product.salePriceCop),
      unit: created.product.unit,
      stockOnHand: created.product.stockOnHand,
      stockReserved: created.product.stockReserved,
      version: created.product.version,
      images: created.images.map((img) => ({ key: img.key, altText: img.altText, position: img.position })),
    };

    await idempotencyPort.save({
      scope,
      idempotencyKey: command.idempotencyKey,
      bodyHash,
      responseJson: response,
    });

    return ok(response);
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}

export interface AdminUpdateProductCommand {
  readonly actorId: string;
  readonly productId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly regularPriceCop: number;
  readonly salePriceCop: number;
  readonly unit: string;
  readonly images: readonly { readonly key: string; readonly altText: string; readonly position: number }[];
}

export async function adminUpdateProduct(
  productRepo: ProductRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminUpdateProductCommand,
): Promise<Result<AdminProductView, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-product-update:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        category_id: command.categoryId,
        name: command.name,
        description: command.description,
        regular_price_cop: command.regularPriceCop,
        sale_price_cop: command.salePriceCop,
        unit: command.unit,
        images: command.images,
        version: command.expectedVersion,
      }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as AdminProductView);
    }

    const current = await productRepo.findById(command.productId);
    if (!current || current.product.deletedAt) {
      return fail(CatalogErrors.resourceNotFound());
    }

    // No modificar stock_reserved desde PATCH general (AC-09)
    const updated = await productRepo.update(
      command.productId,
      command.expectedVersion,
      {
        categoryId: command.categoryId,
        name: command.name,
        description: command.description,
        regularPriceCop: BigInt(command.regularPriceCop),
        salePriceCop: BigInt(command.salePriceCop),
        unit: command.unit,
        images: command.images,
      },
    );
    if (!updated) {
      return fail(CatalogErrors.versionMismatch());
    }

    const response: AdminProductView = {
      id: updated.product.id,
      categoryId: updated.product.categoryId,
      name: updated.product.name,
      description: updated.product.description,
      regularPriceCop: Number(updated.product.regularPriceCop),
      salePriceCop: Number(updated.product.salePriceCop),
      unit: updated.product.unit,
      stockOnHand: updated.product.stockOnHand,
      stockReserved: updated.product.stockReserved,
      version: updated.product.version,
      images: updated.images.map((img) => ({ key: img.key, altText: img.altText, position: img.position })),
    };

    await idempotencyPort.save({
      scope,
      idempotencyKey: command.idempotencyKey,
      bodyHash,
      responseJson: response,
    });

    return ok(response);
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}

export interface AdminDeleteProductCommand {
  readonly actorId: string;
  readonly productId: string;
  readonly idempotencyKey: string;
}

export async function adminDeleteProduct(
  productRepo: ProductRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminDeleteProductCommand,
): Promise<Result<void, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-product-delete:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({ product_id: command.productId }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(undefined);
    }

    const current = await productRepo.findById(command.productId);
    if (!current || current.product.deletedAt) {
      return fail(CatalogErrors.resourceNotFound());
    }

    await productRepo.softDelete(command.productId);

    await idempotencyPort.save({
      scope,
      idempotencyKey: command.idempotencyKey,
      bodyHash,
      responseJson: { deleted: true },
    });

    return ok(undefined);
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}
