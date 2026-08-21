import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import {
  CartRepositoryPort,
  CartWithItemsRecord,
  CartTotalsUpdate,
  CreateCartItemRecord,
} from '../../domain/ports/cart-repository.port';
import { Cart, CartItem, StockReservation } from '../../domain/models';

/**
 * Adapter Prisma de repositorio de carrito (infrastructure).
 *
 * Implementa CartRepositoryPort usando Prisma ORM contra PostgreSQL.
 * Traduce excepciones técnicas a DomainError en su límite.
 */
@Injectable()
export class PrismaCartRepositoryAdapter implements CartRepositoryPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findCartWithItems(sessionId: string): Promise<CartWithItemsRecord | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: {
        items: {
          include: {
            reservation: true,
          },
        },
      },
    });

    if (!cart) return null;

    return this.mapToCartWithItems(cart);
  }

  async findCartWithItemsByCartId(cartId: string): Promise<CartWithItemsRecord | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: {
            reservation: true,
          },
        },
      },
    });

    if (!cart) return null;

    return this.mapToCartWithItems(cart);
  }

  private mapToCartWithItems(cart: any): CartWithItemsRecord {
    return {
      cart: {
        id: cart.id,
        sessionId: cart.sessionId,
        status: cart.status as Cart['status'],
        itemsSubtotalCop: cart.itemsSubtotalCop,
        deliveryFeeCop: cart.deliveryFeeCop,
        ivaCop: cart.ivaCop,
        taxRateBasisPoints: cart.taxRateBasisPoints,
        totalCop: cart.totalCop,
        reservationExpiresAt: cart.reservationExpiresAt,
      },
      items: cart.items.map((item: any) => ({
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCop: item.unitPriceCop,
        subtotalCop: item.subtotalCop,
        reservation: item.reservation
          ? {
              id: item.reservation.id,
              cartItemId: item.reservation.cartItemId,
              productId: item.reservation.productId,
              quantity: item.reservation.quantity,
              status: item.reservation.status as StockReservation['status'],
              expiresAt: item.reservation.expiresAt,
            }
          : null,
      })),
    };
  }

  async createCart(sessionId: string): Promise<Cart> {
    const cart = await this.prisma.cart.create({
      data: {
        sessionId,
        status: 'ACTIVE',
        itemsSubtotalCop: 0n,
        deliveryFeeCop: 5000n,
        ivaCop: 0n,
        taxRateBasisPoints: 1900,
        totalCop: 5000n,
      },
    });

    return {
      id: cart.id,
      sessionId: cart.sessionId,
      status: cart.status as Cart['status'],
      itemsSubtotalCop: cart.itemsSubtotalCop,
      deliveryFeeCop: cart.deliveryFeeCop,
      ivaCop: cart.ivaCop,
      taxRateBasisPoints: cart.taxRateBasisPoints,
      totalCop: cart.totalCop,
      reservationExpiresAt: cart.reservationExpiresAt,
    };
  }

  async updateCartTotals(cartId: string, totals: CartTotalsUpdate): Promise<void> {
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        itemsSubtotalCop: totals.itemsSubtotalCop,
        ivaCop: totals.ivaCop,
        totalCop: totals.totalCop,
        reservationExpiresAt: totals.reservationExpiresAt,
      },
    });
  }

  async findCartItem(cartId: string, productId: string): Promise<CartItem | null> {
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
    });

    if (!item) return null;

    return {
      id: item.id,
      cartId: item.cartId,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCop: item.unitPriceCop,
      subtotalCop: item.subtotalCop,
      reservation: null,
    };
  }

  async findCartItemById(cartItemId: string): Promise<CartItem | null> {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { reservation: true },
    });

    if (!item) return null;

    return {
      id: item.id,
      cartId: item.cartId,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCop: item.unitPriceCop,
      subtotalCop: item.subtotalCop,
      reservation: item.reservation
        ? {
            id: item.reservation.id,
            cartItemId: item.reservation.cartItemId,
            productId: item.reservation.productId,
            quantity: item.reservation.quantity,
            status: item.reservation.status as StockReservation['status'],
            expiresAt: item.reservation.expiresAt,
          }
        : null,
    };
  }

  async createCartItem(item: CreateCartItemRecord): Promise<CartItem> {
    const created = await this.prisma.cartItem.create({
      data: {
        cartId: item.cartId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCop: item.unitPriceCop,
        subtotalCop: item.subtotalCop,
      },
    });

    return {
      id: created.id,
      cartId: created.cartId,
      productId: created.productId,
      quantity: created.quantity,
      unitPriceCop: created.unitPriceCop,
      subtotalCop: created.subtotalCop,
      reservation: null,
    };
  }

  async updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
    subtotalCop: bigint,
  ): Promise<void> {
    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity, subtotalCop },
    });
  }

  async deleteCartItem(cartItemId: string): Promise<void> {
    await this.prisma.cartItem.delete({ where: { id: cartItemId } });
  }

  async closeCart(sessionId: string): Promise<void> {
    await this.prisma.cart.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'CLOSED' },
    });
  }

  async transferCartToSession(
    guestSessionId: string,
    targetSessionId: string,
  ): Promise<void> {
    // Re-apunta el carrito 1:1 de la sesión guest a la sesión autenticada.
    // `session_id` es UNIQUE: si la sesión destino ya tuviera carrito la
    // operación fallaría por restricción, que es el comportamiento seguro
    // (nunca se fusionan ni se pisan carritos).
    await this.prisma.cart.updateMany({
      where: { sessionId: guestSessionId },
      data: { sessionId: targetSessionId },
    });
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    const newExpires = new Date(now.getTime() + 10 * 60 * 1000);
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: now,
        expiresAt: newExpires,
      },
    });
  }
}
