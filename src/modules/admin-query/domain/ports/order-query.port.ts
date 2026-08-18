/**
 * Puerto de salida de consulta read-only de órdenes del módulo `admin-query`
 * (ADR-013).
 *
 * `admin-query` solo lee identity/catalog/orders y nunca escribe. Esqueleto:
 * contrato declarado.
 */
export interface OrderQueryPort {
  /** Lista órdenes paginadas para administración (solo lectura). */
  listOrders(page: number, size: number): Promise<AdminOrderPage>;
}

/** Página de órdenes para administración. */
export interface AdminOrderPage {
  readonly items: AdminOrderRecord[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Registro de orden para administración. */
export interface AdminOrderRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly totalCop: number;
  readonly status: string;
}
