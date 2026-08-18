/**
 * Modelos de dominio del módulo `cart-reservation` (ADR-008).
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP.
 */

/** Estado de un carrito de compra servidor. */
export type CartDomainStatus =
  | 'ACTIVE'
  | 'CHECKOUT_PENDING'
  | 'CLOSED'
  | 'EXPIRED';

/** Estado de una reserva de stock por ítem. */
export type ReservationDomainStatus =
  | 'ACTIVE'
  | 'CHECKOUT_PENDING'
  | 'CONSUMED'
  | 'RELEASED'
  | 'EXPIRED';

/** Carrito de compra del servidor. */
export interface Cart {
  readonly id: string;
  readonly sessionId: string;
  readonly status: CartDomainStatus;
  readonly itemsSubtotalCop: bigint;
  readonly deliveryFeeCop: bigint;
  readonly ivaCop: bigint;
  readonly taxRateBasisPoints: number;
  readonly totalCop: bigint;
  readonly reservationExpiresAt: Date | null;
}

/** Ítem de carrito con su reserva de stock. */
export interface CartItem {
  readonly id: string;
  readonly cartId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCop: bigint;
  readonly subtotalCop: bigint;
  readonly reservation: StockReservation | null;
}

/** Reserva de stock por ítem de carrito. */
export interface StockReservation {
  readonly id: string;
  readonly cartItemId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly status: ReservationDomainStatus;
  readonly expiresAt: Date | null;
}

/** Producto mínimo para el carrito (lectura). */
export interface CartProduct {
  readonly id: string;
  readonly name: string;
  readonly regularPriceCop: bigint;
  readonly salePriceCop: bigint;
  readonly unit: string;
  readonly stockOnHand: number;
  readonly stockReserved: number;
  readonly images: readonly CartProductImage[];
  readonly category: CartCategory;
}

/** Imagen mínima de producto para el carrito. */
export interface CartProductImage {
  readonly key: string;
  readonly altText: string;
  readonly position: number;
}

/** Categoría mínima para el carrito. */
export interface CartCategory {
  readonly id: string;
  readonly name: string;
  readonly imageKey: string;
}

/** Sesión mínima para el carrito. */
export interface CartSession {
  readonly id: string;
  readonly userId: string | null;
  readonly sessionKind: 'GUEST' | 'AUTHENTICATED';
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly revokedAt: Date | null;
}

/** Usuario mínimo para verificación de rol. */
export interface CartUser {
  readonly id: string;
  readonly role: 'admin' | 'cliente';
  readonly mustChangePassword: boolean;
}
