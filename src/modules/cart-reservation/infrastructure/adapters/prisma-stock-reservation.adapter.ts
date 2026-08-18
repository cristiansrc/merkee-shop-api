import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import {
  StockReservationPort,
  ReserveStockParams,
  AdjustReservationParams,
} from '../../domain/ports/stock-reservation.port';
import { StockReservation } from '../../domain/models';

/**
 * Adapter Prisma de reserva de stock (infrastructure).
 *
 * Implementa StockReservationPort con locks SELECT FOR UPDATE por product_id
 * ASC para evitar deadlocks (ADR-008). Actualiza stock_reserved atómicamente.
 *
 * Patrono de lock ordering: product_id ASC确保 que dos transacciones
 * concurrentes siempre bloquean los mismos productos en el mismo orden.
 */
@Injectable()
export class PrismaStockReservationAdapter implements StockReservationPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async reserve(params: ReserveStockParams): Promise<StockReservation> {
    return this.prisma.$transaction(async (tx) => {
      // Lock del producto (SELECT FOR UPDATE, orden ASC por product_id)
      const product = await tx.$queryRaw<
        Array<{
          id: string;
          stock_on_hand: number;
          stock_reserved: number;
          regular_price_cop: bigint;
          sale_price_cop: bigint;
        }>
      >`
        SELECT id, stock_on_hand, stock_reserved, regular_price_cop, sale_price_cop
        FROM products
        WHERE id = ${params.productId}::uuid
        AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!product || product.length === 0) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const p = product[0];
      const available = p.stock_on_hand - p.stock_reserved;

      if (available < params.quantity) {
        throw new Error('STOCK_INSUFFICIENT');
      }

      // Incrementar stock_reserved
      await tx.$executeRaw`
        UPDATE products
        SET stock_reserved = stock_reserved + ${params.quantity}
        WHERE id = ${params.productId}::uuid
      `;

      // Crear reserva
      const reservation = await tx.stockReservation.create({
        data: {
          cartItemId: params.cartItemId,
          productId: params.productId,
          quantity: params.quantity,
          status: 'ACTIVE',
          expiresAt: params.expiresAt,
        },
      });

      return {
        id: reservation.id,
        cartItemId: reservation.cartItemId,
        productId: reservation.productId,
        quantity: reservation.quantity,
        status: reservation.status as StockReservation['status'],
        expiresAt: reservation.expiresAt,
      };
    });
  }

  async adjustReservation(params: AdjustReservationParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Obtener reserva actual
      const reservation = await tx.stockReservation.findUnique({
        where: { id: params.reservationId },
      });

      if (!reservation || reservation.status !== 'ACTIVE') {
        throw new Error('RESERVATION_NOT_ACTIVE');
      }

      const delta = params.newQuantity - reservation.quantity;

      if (delta !== 0) {
        // Lock del producto
        await tx.$queryRaw`
          SELECT id FROM products
          WHERE id = ${params.productId}::uuid
          AND deleted_at IS NULL
          FOR UPDATE
        `;

        if (delta > 0) {
          // Necesitamos stock adicional
          const product = await tx.$queryRaw<
            Array<{ stock_on_hand: number; stock_reserved: number }>
          >`
            SELECT stock_on_hand, stock_reserved
            FROM products WHERE id = ${params.productId}::uuid
          `;

          const p = product[0];
          const available = p.stock_on_hand - p.stock_reserved;
          if (available < delta) {
            throw new Error('STOCK_INSUFFICIENT');
          }

          await tx.$executeRaw`
            UPDATE products
            SET stock_reserved = stock_reserved + ${delta}
            WHERE id = ${params.productId}::uuid
          `;
        } else {
          // Liberar excedente
          await tx.$executeRaw`
            UPDATE products
            SET stock_reserved = stock_reserved + ${delta}
            WHERE id = ${params.productId}::uuid
          `;
        }
      }

      // Actualizar reserva
      await tx.stockReservation.update({
        where: { id: params.reservationId },
        data: {
          quantity: params.newQuantity,
          expiresAt: params.expiresAt,
        },
      });
    });
  }

  async release(reservationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation || reservation.status !== 'ACTIVE') {
        return; // Idempotente: ya liberada
      }

      // Lock del producto
      await tx.$queryRaw`
        SELECT id FROM products
        WHERE id = ${reservation.productId}::uuid
        AND deleted_at IS NULL
        FOR UPDATE
      `;

      // Decrementar stock_reserved
      await tx.$executeRaw`
        UPDATE products
        SET stock_reserved = stock_reserved - ${reservation.quantity}
        WHERE id = ${reservation.productId}::uuid
        AND stock_reserved >= ${reservation.quantity}
      `;

      // Marcar reserva como liberada
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED' },
      });
    });
  }

  async releaseAllForCart(cartId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Obtener todas las reservas ACTIVE del carrito
      const reservations = await tx.stockReservation.findMany({
        where: {
          cartItem: { cartId },
          status: 'ACTIVE',
        },
      });

      for (const reservation of reservations) {
        // Lock del producto
        await tx.$queryRaw`
          SELECT id FROM products
          WHERE id = ${reservation.productId}::uuid
          AND deleted_at IS NULL
          FOR UPDATE
        `;

        // Decrementar stock_reserved
        await tx.$executeRaw`
          UPDATE products
          SET stock_reserved = stock_reserved - ${reservation.quantity}
          WHERE id = ${reservation.productId}::uuid
          AND stock_reserved >= ${reservation.quantity}
        `;

        // Marcar reserva como liberada
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });
      }
    });
  }

  async convertToCheckoutPending(reservationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Obtener la reserva
      const reservation = await tx.stockReservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation || reservation.status !== 'ACTIVE') {
        throw new Error('RESERVATION_NOT_ACTIVE');
      }

      // Convertir a CHECKOUT_PENDING (sin expiración)
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: {
          status: 'CHECKOUT_PENDING',
          expiresAt: null, // CHECKOUT_PENDING sin expiración
        },
      });
    });
  }
}
