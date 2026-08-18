import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { BannerRepositoryPort } from '../../domain/ports/banner-repository.port';
import { ActorLookupPort } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { CatalogErrors } from '../../domain/catalog-errors';
import { createHash } from 'crypto';

export interface AdminBannerView {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly targetPath: string | null;
  readonly displayOrder: number;
  readonly active: boolean;
  readonly version: number;
}

export async function adminListBanners(
  bannerRepo: BannerRepositoryPort,
): Promise<Result<readonly AdminBannerView[], DomainError>> {
  try {
    const banners = await bannerRepo.listAll();
    return ok(
      banners.map((b) => ({
        id: b.id,
        name: b.name,
        imageKey: b.imageKey,
        targetPath: b.targetPath,
        displayOrder: b.displayOrder,
        active: b.active,
        version: b.version,
      })),
    );
  } catch {
    return fail(CatalogErrors.technicalFailure());
  }
}

export interface AdminCreateBannerCommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly imageKey: string;
  readonly targetPath: string | null;
  readonly displayOrder: number;
  readonly active: boolean;
}

export async function adminCreateBanner(
  bannerRepo: BannerRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminCreateBannerCommand,
): Promise<Result<AdminBannerView, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-banner-create:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        name: command.name,
        image_key: command.imageKey,
        target_path: command.targetPath,
        display_order: command.displayOrder,
        active: command.active,
      }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as AdminBannerView);
    }

    const created = await bannerRepo.create({
      name: command.name,
      imageKey: command.imageKey,
      targetPath: command.targetPath,
      displayOrder: command.displayOrder,
      active: command.active,
    });

    const response: AdminBannerView = {
      id: created.id,
      name: created.name,
      imageKey: created.imageKey,
      targetPath: created.targetPath,
      displayOrder: created.displayOrder,
      active: created.active,
      version: created.version,
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

export interface AdminUpdateBannerCommand {
  readonly actorId: string;
  readonly bannerId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly imageKey: string;
  readonly targetPath: string | null;
  readonly displayOrder: number;
  readonly active: boolean;
}

export async function adminUpdateBanner(
  bannerRepo: BannerRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminUpdateBannerCommand,
): Promise<Result<AdminBannerView, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-banner-update:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        name: command.name,
        image_key: command.imageKey,
        target_path: command.targetPath,
        display_order: command.displayOrder,
        active: command.active,
        version: command.expectedVersion,
      }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as AdminBannerView);
    }

    const current = await bannerRepo.findById(command.bannerId);
    if (!current) {
      return fail(CatalogErrors.resourceNotFound());
    }

    const updated = await bannerRepo.update(
      command.bannerId,
      command.expectedVersion,
      {
        name: command.name,
        imageKey: command.imageKey,
        targetPath: command.targetPath,
        displayOrder: command.displayOrder,
        active: command.active,
      },
    );
    if (!updated) {
      return fail(CatalogErrors.versionMismatch());
    }

    const response: AdminBannerView = {
      id: updated.id,
      name: updated.name,
      imageKey: updated.imageKey,
      targetPath: updated.targetPath,
      displayOrder: updated.displayOrder,
      active: updated.active,
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

export interface AdminDeleteBannerCommand {
  readonly actorId: string;
  readonly bannerId: string;
  readonly idempotencyKey: string;
}

export async function adminDeleteBanner(
  bannerRepo: BannerRepositoryPort,
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  command: AdminDeleteBannerCommand,
): Promise<Result<void, DomainError>> {
  try {
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(CatalogErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(CatalogErrors.initialPasswordChangeRequired());
    }

    const scope = `catalog-banner-delete:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({ banner_id: command.bannerId }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(CatalogErrors.idempotencyKeyReused());
      }
      return ok(undefined);
    }

    const current = await bannerRepo.findById(command.bannerId);
    if (!current) {
      return fail(CatalogErrors.resourceNotFound());
    }

    await bannerRepo.softDelete(command.bannerId);

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
