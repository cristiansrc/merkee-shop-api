import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import {
  CartUnitOfWorkPort,
  CartTransactionContext,
} from '../../domain/ports/cart-unit-of-work.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';

/**
 * Adapter Prisma de unidad de trabajo para el carrito (infrastructure).
 *
 * Ejecuta operaciones atómicas de carrito+reserva+idempotencia en una
 * única transacción PostgreSQL.
 */
@Injectable()
export class PrismaCartUnitOfWorkAdapter implements CartUnitOfWorkPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async run<T>(
    work: (ctx: CartTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx: CartTransactionContext = {
          cartRepo: {
            findCartWithItems: async (sessionId) => {
              const cart = await tx.cart.findUnique({
                where: { sessionId },
                include: {
                  items: { include: { reservation: true } },
                },
              });
              if (!cart) return null;
              return {
                cart: {
                  id: cart.id,
                  sessionId: cart.sessionId,
                  status: cart.status as any,
                  itemsSubtotalCop: cart.itemsSubtotalCop,
                  deliveryFeeCop: cart.deliveryFeeCop,
                  ivaCop: cart.ivaCop,
                  taxRateBasisPoints: cart.taxRateBasisPoints,
                  totalCop: cart.totalCop,
                  reservationExpiresAt: cart.reservationExpiresAt,
                },
                items: cart.items.map((item) => ({
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
                        status: item.reservation.status as any,
                        expiresAt: item.reservation.expiresAt,
                      }
                    : null,
                })),
              };
            },
            createCart: async (sessionId) => {
              return tx.cart.create({
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
            },
            findCartItem: async (cartId, productId) => {
              const item = await tx.cartItem.findUnique({
                where: { cartId_productId: { cartId, productId } },
              });
              if (!item) return null;
              return { id: item.id, quantity: item.quantity };
            },
            createCartItem: async (item) => {
              return tx.cartItem.create({
                data: {
                  cartId: item.cartId,
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPriceCop: item.unitPriceCop,
                  subtotalCop: item.subtotalCop,
                },
              });
            },
            updateCartItemQuantity: async (cartItemId, quantity, subtotalCop) => {
              await tx.cartItem.update({
                where: { id: cartItemId },
                data: { quantity, subtotalCop },
              });
            },
            deleteCartItem: async (cartItemId) => {
              await tx.cartItem.delete({ where: { id: cartItemId } });
            },
            updateCartTotals: async (cartId, totals) => {
              await tx.cart.update({
                where: { id: cartId },
                data: {
                  itemsSubtotalCop: totals.itemsSubtotalCop,
                  ivaCop: totals.ivaCop,
                  totalCop: totals.totalCop,
                  reservationExpiresAt: totals.reservationExpiresAt,
                },
              });
            },
            touchSession: async (sessionId, now) => {
              const newExpires = new Date(now.getTime() + 10 * 60 * 1000);
              await tx.session.update({
                where: { id: sessionId },
                data: { lastActivityAt: now, expiresAt: newExpires },
              });
            },
          },
          stockReservation: {
            reserve: async (params) => {
              // Lock del producto
              const products = await tx.$queryRaw<
                Array<{ id: string; stock_on_hand: number; stock_reserved: number }>
              >`
                SELECT id, stock_on_hand, stock_reserved
                FROM products
                WHERE id = ${params.productId}::uuid AND deleted_at IS NULL
                FOR UPDATE
              `;

              if (!products || products.length === 0) {
                throw new Error('PRODUCT_NOT_FOUND');
              }

              const p = products[0];
              if (p.stock_on_hand - p.stock_reserved < params.quantity) {
                throw new Error('STOCK_INSUFFICIENT');
              }

              await tx.$executeRaw`
                UPDATE products
                SET stock_reserved = stock_reserved + ${params.quantity}
                WHERE id = ${params.productId}::uuid
              `;

              return tx.stockReservation.create({
                data: {
                  cartItemId: params.cartItemId,
                  productId: params.productId,
                  quantity: params.quantity,
                  status: 'ACTIVE',
                  expiresAt: params.expiresAt,
                },
              });
            },
            adjustReservation: async (params) => {
              const reservation = await tx.stockReservation.findUnique({
                where: { id: params.reservationId },
              });

              if (!reservation || reservation.status !== 'ACTIVE') {
                throw new Error('RESERVATION_NOT_ACTIVE');
              }

              const delta = params.newQuantity - reservation.quantity;
              if (delta !== 0) {
                await tx.$queryRaw`
                  SELECT id FROM products
                  WHERE id = ${params.productId}::uuid AND deleted_at IS NULL
                  FOR UPDATE
                `;

                if (delta > 0) {
                  const products = await tx.$queryRaw<
                    Array<{ stock_on_hand: number; stock_reserved: number }>
                  >`
                    SELECT stock_on_hand, stock_reserved
                    FROM products WHERE id = ${params.productId}::uuid
                  `;
                  const p = products[0];
                  if (p.stock_on_hand - p.stock_reserved < delta) {
                    throw new Error('STOCK_INSUFFICIENT');
                  }
                }

                await tx.$executeRaw`
                  UPDATE products
                  SET stock_reserved = stock_reserved + ${delta}
                  WHERE id = ${params.productId}::uuid
                `;
              }

              await tx.stockReservation.update({
                where: { id: params.reservationId },
                data: { quantity: params.newQuantity, expiresAt: params.expiresAt },
              });
            },
            release: async (reservationId) => {
              const reservation = await tx.stockReservation.findUnique({
                where: { id: reservationId },
              });
              if (!reservation || reservation.status !== 'ACTIVE') return;

              await tx.$queryRaw`
                SELECT id FROM products
                WHERE id = ${reservation.productId}::uuid AND deleted_at IS NULL
                FOR UPDATE
              `;
              await tx.$executeRaw`
                UPDATE products
                SET stock_reserved = stock_reserved - ${reservation.quantity}
                WHERE id = ${reservation.productId}::uuid
                AND stock_reserved >= ${reservation.quantity}
              `;
              await tx.stockReservation.update({
                where: { id: reservationId },
                data: { status: 'RELEASED' },
              });
            },
            releaseAllForCart: async (cartId) => {
              const reservations = await tx.stockReservation.findMany({
                where: { cartItem: { cartId }, status: 'ACTIVE' },
              });
              for (const r of reservations) {
                await tx.$queryRaw`
                  SELECT id FROM products
                  WHERE id = ${r.productId}::uuid AND deleted_at IS NULL
                  FOR UPDATE
                `;
                await tx.$executeRaw`
                  UPDATE products
                  SET stock_reserved = stock_reserved - ${r.quantity}
                  WHERE id = ${r.productId}::uuid
                  AND stock_reserved >= ${r.quantity}
                `;
                await tx.stockReservation.update({
                  where: { id: r.id },
                  data: { status: 'RELEASED' },
                });
              }
            },
          },
          idempotency: {
            findForUpdate: async (scope, idempotencyKey) => {
              const result = await tx.$queryRaw<
                Array<{
                  id: string;
                  scope: string;
                  idempotency_key: string;
                  body_hash: string;
                  response_json: unknown;
                }>
              >`
                SELECT id, scope, idempotency_key, body_hash, response_json
                FROM idempotency_records
                WHERE scope = ${scope}
                AND idempotency_key = ${idempotencyKey}::uuid
                FOR UPDATE
              `;
              if (!result || result.length === 0) return null;
              const r = result[0];
              return {
                bodyHash: r.body_hash,
                responseJson: r.response_json,
              };
            },
            save: async (params) => {
              await tx.idempotencyRecord.create({
                data: {
                  scope: params.scope,
                  idempotencyKey: params.idempotencyKey,
                  bodyHash: params.bodyHash,
                  responseJson: params.responseJson as any,
                },
              });
            },
          },
        };

        return work(ctx);
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      // Traducir errores de dominio conocidos
      if (message === 'STOCK_INSUFFICIENT') {
        return { ok: false, error: CartErrors.stockInsufficient() } as any;
      }
      if (message === 'RESERVATION_NOT_ACTIVE') {
        return { ok: false, error: CartErrors.reservationNotActive() } as any;
      }
      if (message === 'PRODUCT_NOT_FOUND') {
        return { ok: false, error: CartErrors.resourceNotFound() } as any;
      }

      // Error técnico no clasificable
      return { ok: false, error: CartErrors.technicalFailure() } as any;
    }
  }
}
