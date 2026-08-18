import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { OrderRepositoryPort } from '../../domain/ports/order-repository.port';
import { OrderErrors } from '../../domain/order-errors';

/**
 * Puerto de entrada (caso de uso) de listado de órdenes propias.
 *
 * Paginación contractual de órdenes (AC-08).
 */
export interface ListOrdersUseCase {
  execute(query: ListOrdersQuery): Promise<Result<ListOrdersResult, DomainError>>;
}

/** Consulta de entrada del caso de uso. */
export interface ListOrdersQuery {
  readonly ownerId: string;
  readonly page: number;
  readonly size: number;
}

/** Resultado de éxito: página de órdenes. */
export interface ListOrdersResult {
  readonly items: OrderView[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Vista de orden. */
export interface OrderView {
  readonly id: string;
  readonly order_number: string;
  readonly status: string;
  readonly items_subtotal_cop: number;
  readonly delivery_fee_cop: 5000;
  readonly iva_cop: number;
  readonly tax_rate_basis_points: 1900;
  readonly total_cop: number;
  readonly items: readonly OrderItemView[];
  readonly delivery_recipient_name: string;
  readonly delivery_line1: string;
  readonly delivery_city: string;
  readonly delivery_phone: string;
  readonly created_at: string;
}

/** Vista de ítem de orden. */
export interface OrderItemView {
  readonly product_id: string | null;
  readonly product_name: string;
  readonly unit: string;
  readonly unit_price_cop: number;
  readonly quantity: number;
  readonly subtotal_cop: number;
}

/**
 * Implementación del caso de uso de listado de órdenes (Master Spec AC-08).
 *
 * Retorna órdenes propias del actor paginadas y en modo solo lectura.
 */
export class ListOrdersUseCaseImpl implements ListOrdersUseCase {
  constructor(private readonly orderRepo: OrderRepositoryPort) {}

  async execute(
    query: ListOrdersQuery,
  ): Promise<Result<ListOrdersResult, DomainError>> {
    // Validar parámetros de paginación
    if (query.page < 1 || query.size < 1 || query.size > 100) {
      return fail(OrderErrors.resourceNotFound());
    }

    const page = await this.orderRepo.listByOwner(
      query.ownerId,
      query.page,
      query.size,
    );

    const items: OrderView[] = page.items.map((item) => ({
      id: item.id,
      order_number: item.orderNumber,
      status: item.status,
      items_subtotal_cop: 0, // Se carga en detalle
      delivery_fee_cop: 5000 as const,
      iva_cop: 0,
      tax_rate_basis_points: 1900 as const,
      total_cop: Number(item.totalCop),
      items: [],
      delivery_recipient_name: '',
      delivery_line1: '',
      delivery_city: '',
      delivery_phone: '',
      created_at: item.createdAt.toISOString(),
    }));

    return ok({
      items,
      page: page.page,
      size: page.size,
      total: page.total,
    });
  }
}
