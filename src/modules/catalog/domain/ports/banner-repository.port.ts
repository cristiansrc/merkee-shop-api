/**
 * Puerto de salida de repositorio de banners (Master Spec §29-33).
 *
 * Banners con soft delete. `version` para optimistic locking.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface BannerRecord {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly targetPath: string | null;
  readonly displayOrder: number;
  readonly active: boolean;
  readonly version: number;
  readonly deletedAt: Date | null;
}

export interface BannerRepositoryPort {
  /** Lista banners activos ordenados por display_order (público). */
  listActive(): Promise<readonly BannerRecord[]>;

  /** Lista banners para admin (excluye soft-deleted, incluye inactive). */
  listAll(): Promise<readonly BannerRecord[]>;

  /** Busca un banner por id (incluidos soft-deleted). */
  findById(bannerId: string): Promise<BannerRecord | null>;

  /** Crea un banner. */
  create(data: {
    readonly name: string;
    readonly imageKey: string;
    readonly targetPath: string | null;
    readonly displayOrder: number;
    readonly active: boolean;
  }): Promise<BannerRecord>;

  /** Actualiza un banner con optimistic locking. Retorna null si version mismatch. */
  update(
    bannerId: string,
    expectedVersion: number,
    data: {
      readonly name: string;
      readonly imageKey: string;
      readonly targetPath: string | null;
      readonly displayOrder: number;
      readonly active: boolean;
    },
  ): Promise<BannerRecord | null>;

  /** Soft delete de un banner. */
  softDelete(bannerId: string): Promise<boolean>;
}
