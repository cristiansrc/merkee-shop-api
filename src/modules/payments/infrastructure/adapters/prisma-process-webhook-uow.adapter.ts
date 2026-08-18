import { Injectable } from '@nestjs/common';
import {
  ProcessWebhookUnitOfWorkPort,
  WebhookTransactionContext,
} from '../../domain/ports/process-webhook-unit-of-work.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';
import { paymentErrors } from '../../domain/payment-errors';

/**
 * Adapter Prisma de unidad de trabajo para procesamiento de webhook (infrastructure).
 *
 * Ejecuta la transacción atómica de procesamiento de webhook:
 * 1. Persistir el evento de webhook (deduplicación)
 * 2. Buscar el pago asociado
 * 3. Buscar reservas CHECKOUT_PENDING equivalentes
 * 4. Consumir holds y decrementar stock (si APPROVED)
 * 5. Crear refund (si hold no consumible)
 * 6. Actualizar estados de pago y orden
 * 7. Crear evento de outbox
 *
 * Todo en una única transacción PostgreSQL con rollback total ante fallo.
 */
@Injectable()
export class PrismaProcessWebhookUnitOfWorkAdapter implements ProcessWebhookUnitOfWorkPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async run<T>(
    work: (ctx: WebhookTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx: WebhookTransactionContext = {
          webhookEventSaver: {
            save: async (params) => {
              const event = await tx.paymentWebhookEvent.create({
                data: {
                  provider: params.provider as 'WOMPI' | 'MERCADO_PAGO',
                  providerEventId: params.providerEventId,
                  eventType: params.eventType,
                  payload: params.payload as any,
                  status: 'RECEIVED',
                },
              });
              return event.id;
            },
            updateStatus: async (
              eventId: string,
              status: 'PROCESSED' | 'DUPLICATE' | 'FAILED',
            ) => {
              await tx.paymentWebhookEvent.update({
                where: { id: eventId },
                data: {
                  status: status as any,
                  processedAt:
                    status === 'PROCESSED' || status === 'FAILED'
                      ? new Date()
                      : undefined,
                },
              });
            },
          },

          paymentFinder: {
            findByIdForUpdate: async (paymentId) => {
              const result = await tx.$queryRaw<
                Array<{
                  id: string;
                  order_id: string;
                  cart_id: string;
                  provider: string;
                  status: string;
                  amount_cop: bigint;
                  provider_reference: string | null;
                }>
              >`
                SELECT p.id, p.order_id, o.cart_id, p.provider, p.status, p.amount_cop, p.provider_reference
                FROM payments p
                JOIN orders o ON o.id = p.order_id
                WHERE p.id = ${paymentId}::uuid
                FOR UPDATE OF p
              `;
              if (!result || result.length === 0) return null;
              const r = result[0];
              return {
                id: r.id,
                orderId: r.order_id,
                cartId: r.cart_id,
                provider: r.provider,
                status: r.status,
                amountCop: r.amount_cop,
                providerReference: r.provider_reference,
              };
            },
            findByOrderIdForUpdate: async (orderId) => {
              const result = await tx.$queryRaw<
                Array<{
                  id: string;
                  order_id: string;
                  cart_id: string;
                  provider: string;
                  status: string;
                  amount_cop: bigint;
                  provider_reference: string | null;
                }>
              >`
                SELECT p.id, p.order_id, o.cart_id, p.provider, p.status, p.amount_cop, p.provider_reference
                FROM payments p
                JOIN orders o ON o.id = p.order_id
                WHERE p.order_id = ${orderId}::uuid
                FOR UPDATE OF p
                LIMIT 1
              `;
              if (!result || result.length === 0) return null;
              const r = result[0];
              return {
                id: r.id,
                orderId: r.order_id,
                cartId: r.cart_id,
                provider: r.provider,
                status: r.status,
                amountCop: r.amount_cop,
                providerReference: r.provider_reference,
              };
            },
            findByProviderReferenceForUpdate: async (provider, providerReference) => {
              const result = await tx.$queryRaw<
                Array<{
                  id: string;
                  order_id: string;
                  cart_id: string;
                  provider: string;
                  status: string;
                  amount_cop: bigint;
                  provider_reference: string | null;
                }>
              >`
                SELECT p.id, p.order_id, o.cart_id, p.provider, p.status, p.amount_cop, p.provider_reference
                FROM payments p
                JOIN orders o ON o.id = p.order_id
                WHERE p.provider = ${provider}::"PaymentProvider"
                AND p.provider_reference = ${providerReference}
                FOR UPDATE OF p
                LIMIT 1
              `;
              if (!result || result.length === 0) return null;
              const r = result[0];
              return {
                id: r.id,
                orderId: r.order_id,
                cartId: r.cart_id,
                provider: r.provider,
                status: r.status,
                amountCop: r.amount_cop,
                providerReference: r.provider_reference,
              };
            },
          },

          holdFinder: {
            findCheckoutPendingHolds: async (cartId) => {
              const holds = await tx.stockReservation.findMany({
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
            },
          },

          holdConsumer: {
            consumeHold: async (params) => {
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
            },
          },

          refundCreator: {
            createRefundPending: async (params) => {
              // Verificar si ya existe un refund para este pago (idempotente)
              const existingRefund = await tx.paymentRefund.findUnique({
                where: { paymentId: params.paymentId },
              });

              if (existingRefund) {
                return existingRefund.id;
              }

              const refund = await tx.paymentRefund.create({
                data: {
                  paymentId: params.paymentId,
                  status: 'PENDING',
                  amountCop: params.amountCop,
                  idempotencyKey: params.idempotencyKey,
                },
              });

              return refund.id;
            },
          },

          paymentUpdater: {
            updateStatus: async (paymentId, status) => {
              await tx.payment.update({
                where: { id: paymentId },
                data: { status: status as any },
              });
            },
          },

          orderUpdater: {
            updateStatus: async (orderId, status) => {
              await tx.order.update({
                where: { id: orderId },
                data: { status: status as any },
              });
            },
          },

          outboxWriter: {
            write: async (params) => {
              await tx.outboxEvent.create({
                data: {
                  eventType: params.eventType,
                  aggregateType: params.aggregateType,
                  aggregateId: params.aggregateId,
                  payload: params.payload as any,
                  status: 'PENDING',
                },
              });
            },
          },
        };

        return work(ctx);
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      // Traducir errores de dominio conocidos
      if (message === 'PAYMENT_HOLD_NOT_CONSUMABLE') {
        return { ok: false, error: paymentErrors.paymentHoldNotConsumable() } as any;
      }

      // Error técnico no clasificable
      return { ok: false, error: paymentErrors.technicalFailure() } as any;
    }
  }
}
