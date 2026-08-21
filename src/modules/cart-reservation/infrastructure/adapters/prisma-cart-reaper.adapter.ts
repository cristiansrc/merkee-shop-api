import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CartPrismaService } from '../cart-prisma.service';
import {
  CartReaperPort,
  ReaperBatchResult,
} from '../../domain/ports/cart-reaper.port';
import { REAPER_TRANSACTION_TIMEOUT_MS } from '../../domain/ports/cart-reaper.config';

/**
 * Adapter Prisma del reaper de reservas (infrastructure).
 *
 * Implementa CartReaperPort con:
 * - Transacción con timeout 5s (`SET LOCAL statement_timeout`).
 * - Selección de reservas ACTIVE con `expires_at < now` y `FOR UPDATE SKIP LOCKED`.
 * - Transición condicional ACTIVE→EXPIRED (evita doble liberación).
 * - Decremento de `stock_reserved` por cada reserva liberada.
 * - Batch ≤500 para evitar sobrecarga.
 *
 * Patrono: exclusión mutua distribuida vía `FOR UPDATE SKIP LOCKED` +
 * transacción con timeout garantiza que dos reapers concurrentes no
 * liberen la misma reserva.
 */
@Injectable()
export class PrismaCartReaperAdapter implements CartReaperPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async expireBatch(now: Date, limit: number): Promise<ReaperBatchResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // `SET LOCAL` no acepta parámetros; el literal solo deriva de la
        // constante interna y nunca de input externo.
        await tx.$executeRaw(
          Prisma.raw(
            `SET LOCAL statement_timeout = '${REAPER_TRANSACTION_TIMEOUT_MS}ms'`,
          ),
        );

        // Seleccionar reservas ACTIVE expiradas con FOR UPDATE SKIP LOCKED
        const expiredReservations = await tx.$queryRaw<
          Array<{
            id: string;
            product_id: string;
            quantity: number;
            expires_at: Date;
          }>
        >`
          SELECT sr.id, sr.product_id, sr.quantity, sr.expires_at
          FROM stock_reservations sr
          WHERE sr.status = 'ACTIVE'
            AND sr.expires_at < ${now}
          ORDER BY sr.expires_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;

        if (expiredReservations.length === 0) {
          return { selected: 0, released: 0, skippedTerminal: 0 };
        }

        let released = 0;
        let skippedTerminal = 0;

        for (const reservation of expiredReservations) {
          // Transición condicional: verificar que la reserva sigue ACTIVE
          const updated = await tx.$executeRaw`
            UPDATE stock_reservations
            SET status = 'EXPIRED'
            WHERE id = ${reservation.id}::uuid
              AND status = 'ACTIVE'
          `;

          if (updated === 0) {
            // La reserva ya no está ACTIVE (doble liberación evitada)
            skippedTerminal++;
            continue;
          }

          // Decrementar stock_reserved del producto
          await tx.$executeRaw`
            UPDATE products
            SET stock_reserved = GREATEST(0, stock_reserved - ${reservation.quantity})
            WHERE id = ${reservation.product_id}::uuid
              AND stock_reserved >= ${reservation.quantity}
          `;

          released++;
        }

        return {
          selected: expiredReservations.length,
          released,
          skippedTerminal,
        };
      },
      {
        timeout: REAPER_TRANSACTION_TIMEOUT_MS,
      },
    );
  }
}
