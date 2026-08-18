/**
 * Puerto de salida de repositorio de categorías (Master Spec §87).
 *
 * Una categoría por producto. Soft delete. `version` para optimistic locking.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface CategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly version: number;
  readonly deletedAt: Date | null;
}

export interface CategoryRepositoryPort {
  /** Lista todas las categorías (admin: incluye inactive). */
  listAll(): Promise<readonly CategoryRecord[]>;

  /** Lista categorías activas (público). */
  listActive(): Promise<readonly CategoryRecord[]>;

  /** Busca una categoría por id (incluidas las soft-deleted). */
  findById(categoryId: string): Promise<CategoryRecord | null>;

  /** Busca una categoría activa por id. */
  findActiveById(categoryId: string): Promise<CategoryRecord | null>;

  /** Crea una categoría. Retorna el registro creado. */
  create(data: {
    readonly name: string;
    readonly imageKey: string;
  }): Promise<CategoryRecord>;

  /** Actualiza una categoría con optimistic locking. Retorna null si version mismatch. */
  update(
    categoryId: string,
    expectedVersion: number,
    data: { readonly name: string; readonly imageKey: string },
  ): Promise<CategoryRecord | null>;

  /** Soft delete de una categoría. Retorna false si tiene productos activos. */
  softDelete(categoryId: string): Promise<boolean>;

  /** Cuenta productos activos en una categoría. */
  countActiveProducts(categoryId: string): Promise<number>;
}
