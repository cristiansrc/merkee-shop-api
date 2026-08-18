/**
 * Puerto de salida de repositorio de órdenes del módulo `orders`.
 *
 * Orden única por carrito; snapshots `delivery_*` NOT NULL (Master Spec §87).
 */
export interface OrderRepositoryPort {
  /** Busca una orden por id con items. */
  findById(orderId: string): Promise<OrderRecord | null>;
  /** Lista órdenes de un actor paginadas. */
  listByOwner(ownerId: string, page: number, size: number): Promise<OrderPage>;
}

/** Registro de orden (modelo de dominio). */
export interface OrderRecord {
  readonly id: string;
  readonly orderNumber: string;
  readonly ownerId: string;
  readonly status: string;
  readonly itemsSubtotalCop: bigint;
  readonly deliveryFeeCop: bigint;
  readonly ivaCop: bigint;
  readonly taxRateBasisPoints: number;
  readonly totalCop: bigint;
  readonly deliveryRecipientName: string;
  readonly deliveryLine1: string;
  readonly deliveryCity: string;
  readonly deliveryPhone: string;
  readonly createdAt: Date;
  readonly items: readonly OrderItemRecord[];
}

/** Ítem de orden. */
export interface OrderItemRecord {
  readonly id: string;
  readonly productId: string | null;
  readonly productName: string;
  readonly unit: string;
  readonly unitPriceCop: bigint;
  readonly quantity: number;
  readonly subtotalCop: bigint;
}

/** Página de órdenes. */
export interface OrderPage {
  readonly items: OrderListItem[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Ítem de lista de órdenes (vista simplificada). */
export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly totalCop: bigint;
  readonly createdAt: Date;
}
