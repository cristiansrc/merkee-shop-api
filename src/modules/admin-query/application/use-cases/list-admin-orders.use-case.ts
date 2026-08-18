import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de entrada (caso de uso) de consulta read-only de órdenes admin.
 *
 * Esqueleto: contrato declarado; implementación en MSF-ADMIN-003.
 */
export interface ListAdminOrdersUseCase {
  execute(query: ListAdminOrdersQuery): Promise<Result<ListAdminOrdersResult, DomainError>>;
}

/** Consulta de entrada del caso de uso. */
export interface ListAdminOrdersQuery {
  readonly page: number;
  readonly size: number;
}

/** Resultado de éxito: página de órdenes admin. */
export interface ListAdminOrdersResult {
  readonly items: AdminOrderView[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Vista de orden admin. */
export interface AdminOrderView {
  readonly id: string;
  readonly ownerId: string;
  readonly totalCop: number;
  readonly status: string;
}
