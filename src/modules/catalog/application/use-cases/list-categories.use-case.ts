import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CategoryRepositoryPort, CategoryRecord } from '../../domain/ports/category-repository.port';

/** Resultado de listado de categorías públicas. */
export interface CategoryView {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
  readonly version: number;
}

/**
 * Caso de uso: listado público de categorías activas.
 * GET /categories → 200 CategoryResponse[]
 */
export async function listCategories(
  categoryRepo: CategoryRepositoryPort,
): Promise<Result<readonly CategoryView[], DomainError>> {
  try {
    const categories = await categoryRepo.listActive();
    return ok(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        imageKey: c.imageKey,
        version: c.version,
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
