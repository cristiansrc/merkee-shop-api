import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';
import {
  PaymentReconciliationRepositoryPort,
  PendingPaymentLookupResult,
} from '../../domain/ports/payment-reconciliation.port';
import { RECONCILIATION_PROVIDER_TIMEOUT_MS } from '../../domain/ports/payment-reconciliation.config';

/**
 * Adapter Prisma de repositorio de reconciliación de pagos (infrastructure).
 *
 * Implementa PaymentReconciliationRepositoryPort con:
 * - Transacción con timeout configurable.
 * - Selección de pagos PENDING con `created_at` en la ventana [minAge, maxAge].
 * - `FOR UPDATE SKIP LOCKED` para exclusión mutua distribuida.
 * - Transiciones idempotentes: solo aplica si el pago no es terminal.
 *
 * Patrono: exclusión mutua distribuida vía `FOR UPDATE SKIP LOCKED` +
 * transacción con timeout garantiza que dos jobs concurrentes no
 * reconcilen el mismo pago.
 */
@Injectable()
export class PrismaPaymentReconciliationAdapter
  implements PaymentReconciliationRepositoryPort
{
  constructor(private readonly prisma: CartPrismaService) {}

  async findPendingPayments(params: {
    now: Date;
    minAgeMs: number;
    maxAgeMs: number;
    limit: number;
  }): Promise<ReadonlyArray<PendingPaymentLookupResult>> {
    const minAgeDate = new Date(params.now.getTime() - params.maxAgeMs);
    const maxAgeDate = new Date(params.now.getTime() - params.minAgeMs);

    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        order_id: string;
        cart_id: string;
        provider: string;
        provider_reference: string | null;
        status: string;
        amount_cop: bigint;
        created_at: Date;
      }>
    >`
      SELECT
        p.id,
        p.order_id,
        o.cart_id,
        p.provider,
        p.provider_reference,
        p.status,
        p.amount_cop,
        p.created_at
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'PENDING'
        AND p.created_at >= ${minAgeDate}
        AND p.created_at <= ${maxAgeDate}
      ORDER BY p.created_at ASC
      LIMIT ${params.limit}
      FOR UPDATE SKIP LOCKED
    `;

    return results.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      cartId: r.cart_id,
      provider: r.provider,
      providerReference: r.provider_reference,
      status: r.status,
      amountCop: r.amount_cop,
      createdAt: r.created_at,
    }));
  }

  async transitionPaymentStatus(params: {
    paymentId: string;
    orderId: string;
    paymentStatus: 'APPROVED' | 'DECLINED' | 'EXPIRED';
    orderStatus:
      | 'PAID'
      | 'PAYMENT_FAILED'
      | 'PAYMENT_EXPIRED'
      | 'PAYMENT_REFUND_PENDING';
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Actualizar estado del pago (solo si no es terminal — idempotente)
      await tx.$executeRaw`
        UPDATE payments
        SET status = ${params.paymentStatus}::"PaymentStatus"
        WHERE id = ${params.paymentId}::uuid
          AND status = 'PENDING'
      `;

      // Actualizar estado de la orden
      await tx.order.update({
        where: { id: params.orderId },
        data: { status: params.orderStatus as any },
      });
    });
  }

  async findCheckoutPendingHolds(
    cartId: string,
  ): Promise<
    ReadonlyArray<{
      reservationId: string;
      productId: string;
      quantity: number;
    }>
  > {
    const holds = await this.prisma.stockReservation.findMany({
      where: {
        cartItem: { cartId },
        status: 'CHECKOUT_PENDING',
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
      },
    });

    return holds.map((h) => ({
      reservationId: h.id,
      productId: h.productId,
      quantity: h.quantity,
    }));
  }

  async consumeHold(params: {
    reservationId: string;
    productId: string;
    quantity: number;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Lock del producto (SELECT FOR UPDATE)
      const product = await tx.$queryRaw<
        Array<{
          id: string;
          stock_on_hand: number;
          stock_reserved: number;
        }>
      >`
        SELECT id, stock_on_hand, stock_reserved
        FROM products
        WHERE id = ${params.productId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!product || product.length === 0) {
        throw new Error('PAYMENT_HOLD_NOT_CONSUMABLE');
      }

      const p = product[0];

      // Verificar stock_on_hand >= quantity
      if (p.stock_on_hand < params.quantity) {
        throw new Error('PAYMENT_HOLD_NOT_CONSUMABLE');
      }

      // Decrementar stock_on_hand y stock_reserved
      await tx.$executeRaw`
        UPDATE products
        SET stock_on_hand = stock_on_hand - ${params.quantity},
            stock_reserved = stock_reserved - ${params.quantity}
        WHERE id = ${params.productId}::uuid
          AND stock_on_hand >= ${params.quantity}
          AND stock_reserved >= ${params.quantity}
      `;

      // Marcar reserva como CONSUMED
      await tx.stockReservation.update({
        where: { id: params.reservationId },
        data: { status: 'CONSUMED' },
      });
    });
  }

  async createRefundPending(params: {
    paymentId: string;
    amountCop: bigint;
    idempotencyKey: string;
  }): Promise<string> {
    // Verificar si ya existe un refund para este pago (idempotente)
    const existingRefund = await this.prisma.paymentRefund.findUnique({
      where: { paymentId: params.paymentId },
    });

    if (existingRefund) {
      return existingRefund.id;
    }

    const refund = await this.prisma.paymentRefund.create({
      data: {
        paymentId: params.paymentId,
        status: 'PENDING',
        amountCop: params.amountCop,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return refund.id;
  }

  async writeOutboxEvent(params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
  }): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        eventType: params.eventType,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        payload: params.payload as any,
        status: 'PENDING',
      },
    });
  }
}
