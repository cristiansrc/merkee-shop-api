/**
 * Puerto de salida de repositorio de carrito (ADR-008).
 *
 * Carrito 1:1 sesión; item único carrito/producto; reserva 1:1 item
 * (Master Spec §87).
 */
import { Cart, CartItem, CartSession, CartUser } from '../models';

export interface CartRepositoryPort {
  /** Busca el carrito de una sesión con sus ítems y reservas. */
  findCartWithItems(sessionId: string): Promise<CartWithItemsRecord | null>;

  /** Busca un carrito por ID con sus ítems y reservas. */
  findCartWithItemsByCartId(cartId: string): Promise<CartWithItemsRecord | null>;

  /** Crea un carrito nuevo para una sesión. */
  createCart(sessionId: string): Promise<Cart>;

  /** Actualiza los totales del carrito y reservation_expires_at. */
  updateCartTotals(
    cartId: string,
    totals: CartTotalsUpdate,
  ): Promise<void>;

  /** Busca un ítem de carrito por carrito+producto. */
  findCartItem(
    cartId: string,
    productId: string,
  ): Promise<CartItem | null>;

  /** Busca un ítem de carrito por ID. */
  findCartItemById(cartItemId: string): Promise<CartItem | null>;

  /** Crea un ítem de carrito. */
  createCartItem(item: CreateCartItemRecord): Promise<CartItem>;

  /** Actualiza la cantidad de un ítem. */
  updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
    subtotalCop: bigint,
  ): Promise<void>;

  /** Elimina un ítem de carrito. */
  deleteCartItem(cartItemId: string): Promise<void>;

  /** Cierra/expira un carrito (promoción guest→admin, reaper). */
  closeCart(sessionId: string): Promise<void>;

  /**
   * Transfiere el carrito de una sesión guest a otra sesión (promoción
   * guest→cliente). Re-apunta `carts.session_id` conservando ítems, reservas y
   * totales. Idempotente: si no existe carrito para la sesión origen, no-op.
   */
  transferCartToSession(guestSessionId: string, targetSessionId: string): Promise<void>;

  /** Renueva la actividad de una sesión (now + 10m). */
  touchSession(sessionId: string, now: Date): Promise<void>;
}

/** Carrito con ítems y reservas precargados. */
export interface CartWithItemsRecord {
  readonly cart: Cart;
  readonly items: CartItem[];
}

/** Totales recalculados del carrito. */
export interface CartTotalsUpdate {
  readonly itemsSubtotalCop: bigint;
  readonly ivaCop: bigint;
  readonly totalCop: bigint;
  readonly reservationExpiresAt: Date | null;
}

/** Datos para crear un ítem de carrito. */
export interface CreateCartItemRecord {
  readonly cartId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCop: bigint;
  readonly subtotalCop: bigint;
}
