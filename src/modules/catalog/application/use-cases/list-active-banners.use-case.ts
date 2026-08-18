import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { BannerRepositoryPort, BannerRecord } from '../../domain/ports/banner-repository.port';

/** Vista pública de banner. */
export interface BannerView {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly targetPath: string | null;
  readonly displayOrder: number;
  readonly active: boolean;
  readonly version: number;
}

/**
 * Caso de uso: listado público de banners activos.
 * GET /banners → 200 BannerResponse[]
 */
export async function listActiveBanners(
  bannerRepo: BannerRepositoryPort,
): Promise<Result<readonly BannerView[], DomainError>> {
  try {
    const banners = await bannerRepo.listActive();
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
    return fail({
      code: 'TECHNICAL_DEPENDENCY_FAILURE',
      kind: 'technical',
      messageKey: 'technical.dependency.failure',
    });
  }
}
