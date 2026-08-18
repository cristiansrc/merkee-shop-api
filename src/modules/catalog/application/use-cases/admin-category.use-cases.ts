import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CategoryRepositoryPort } from '../../domain/ports/category-repository.port';
import { ActorLookupPort } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { CatalogErrors } from '../../domain/catalog-errors';
import { createHash } from 'crypto';

export interface AdminListCategoriesView {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly version: number;
  readonly deletedAt: Date | null;
}

export async function adminListCategories(
  categoryRepo: CategoryRepositoryPort,
): Promise<Result<readonly AdminListCategoriesView[], DomainError>> {
  try {
    const categories = await categoryRepo.listAll();
    return ok(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        imageKey: c.imageKey,
        version: c.version,
        deletedAt: c.deletedAt,
      })),
    );
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}

export interface AdminCreateCategoryView {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly version: number;
}

export interface AdminCreateCategoryCommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly imageKey: string;
}

export async function adminCreateCategory(
  categoryRepo: CategoryRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminCreateCategoryCommand,
): Promise<Result<AdminCreateCategoryView, DomainError>> {
  try {
    // Verificar actor
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    // Idempotencia
    const scope = `catalog-category-create:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({ name: command.name, image_key: command.imageKey }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      const resp = existing.responseJson as AdminCreateCategoryView;
      return ok(resp);
    }

    // Crear categoría
    const created = await categoryRepo.create({
      name: command.name,
      imageKey: command.imageKey,
    });

    const response: AdminCreateCategoryView = {
      id: created.id,
      name: created.name,
      imageKey: created.imageKey,
      version: created.version,
    };

    // Persistir idempotencia
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

export interface AdminUpdateCategoryCommand {
  readonly actorId: string;
  readonly categoryId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly imageKey: string;
}

export async function adminUpdateCategory(
  categoryRepo: CategoryRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminUpdateCategoryCommand,
): Promise<Result<AdminCreateCategoryView, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-category-update:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({ name: command.name, image_key: command.imageKey, version: command.expectedVersion }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as AdminCreateCategoryView);
    }

    // Verificar existencia
    const current = await categoryRepo.findById(command.categoryId);
    if (!current) {
      return fail(CatalogErrors.resourceNotFound());
    }

    // Optimistic locking
    const updated = await categoryRepo.update(
      command.categoryId,
      command.expectedVersion,
      { name: command.name, imageKey: command.imageKey },
    );
    if (!updated) {
      return fail(CatalogErrors.versionMismatch());
    }

    const response: AdminCreateCategoryView = {
      id: updated.id,
      name: updated.name,
      imageKey: updated.imageKey,
      version: updated.version,
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

export interface AdminDeleteCategoryCommand {
  readonly actorId: string;
  readonly categoryId: string;
  readonly idempotencyKey: string;
}

export async function adminDeleteCategory(
  categoryRepo: CategoryRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminDeleteCategoryCommand,
): Promise<Result<void, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-category-delete:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({ category_id: command.categoryId }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(undefined);
    }

    // Verificar existencia
    const current = await categoryRepo.findById(command.categoryId);
    if (!current) {
      return fail(CatalogErrors.resourceNotFound());
    }

    // Verificar que no tenga productos activos
    const activeCount = await categoryRepo.countActiveProducts(command.categoryId);
    if (activeCount > 0) {
      return fail(CatalogErrors.categoryOccupied());
    }

    const deleted = await categoryRepo.softDelete(command.categoryId);
    if (!deleted) {
      return fail(CatalogErrors.categoryOccupied());
    }

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
