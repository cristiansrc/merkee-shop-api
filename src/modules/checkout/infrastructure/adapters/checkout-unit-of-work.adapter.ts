import { Injectable, Inject } from '@nestjs/common';
import {
  CheckoutUnitOfWorkPort,
  CheckoutTransactionContext,
} from '../../domain/ports/checkout-unit-of-work.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CheckoutErrors } from '../../domain/checkout-errors';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';
import { CART_TOKENS } from '../../../cart-reservation/cart-reservation.tokens';
import { StockReservationPort } from '../../../cart-reservation/domain/ports/stock-reservation.port';
import { CartRepositoryPort } from '../../../cart-reservation/domain/ports/cart-repository.port';

/**
 * Adapter Prisma de unidad de trabajo para checkout (infrastructure).
 *
 * Ejecuta la transacción atómica de checkout:
 * 1. Validar reservas ACTIVE
 * 2. Convertir ACTIVE → CHECKOUT_PENDING
 * 3. Crear orden + pago pending
 * 4. Registrar idempotencia
 *
 * Todo en una única transacción PostgreSQL con rollback total ante fallo.
 */
@Injectable()
export class PrismaCheckoutUnitOfWorkAdapter implements CheckoutUnitOfWorkPort {
  constructor(
    private readonly prisma: CartPrismaService,
    @Inject(CART_TOKENS.STOCK_RESERVATION)
    private readonly stockReservation: StockReservationPort,
    @Inject(CART_TOKENS.CART_REPOSITORY)
    private readonly cartRepo: CartRepositoryPort,
  ) {}

  async run<T>(
    work: (ctx: CheckoutTransactionContext) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ctx: CheckoutTransactionContext = {
          cartWithItems: {} as any, // Se carga antes de la transacción
          reservationConverter: {
            convertActiveToCheckoutPending: async (cartId: string) => {
              // Obtener reservas ACTIVE dentro de la transacción
              const reservations = await tx.stockReservation.findMany({
                where: {
                  cartItem: { cartId },
                  status: 'ACTIVE',
                },
              });

              for (const reservation of reservations) {
                // Convertir a CHECKOUT_PENDING (sin expiración)
                await tx.stockReservation.update({
                  where: { id: reservation.id },
                  data: {
                    status: 'CHECKOUT_PENDING',
                    expiresAt: null,
                  },
                });
              }
            },
          },
          orderCreator: {
            createOrderAndPayment: async (params) => {
              // Verificar que no exista ya una orden para este carrito
              const existingOrder = await tx.order.findUnique({
                where: { cartId: params.cartId },
              });

              if (existingOrder) {
                throw new Error('ORDER_ALREADY_EXISTS');
              }

              // Generar número de orden único
              const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

              // Crear orden
              const order = await tx.order.create({
                data: {
                  orderNumber,
                  cartId: params.cartId,
                  userId: params.userId,
                  status: 'PENDING_PAYMENT',
                  itemsSubtotalCop: params.itemsSubtotalCop,
                  deliveryFeeCop: params.deliveryFeeCop,
                  ivaCop: params.ivaCop,
                  taxRateBasisPoints: params.taxRateBasisPoints,
                  totalCop: params.totalCop,
                  deliveryRecipientName: params.deliveryRecipientName,
                  deliveryLine1: params.deliveryLine1,
                  deliveryCity: params.deliveryCity,
                  deliveryPhone: params.deliveryPhone,
                  items: {
                    create: params.items.map((item) => ({
                      productId: item.productId,
                      productName: item.productName,
                      unit: item.unit,
                      unitPriceCop: item.unitPriceCop,
                      quantity: item.quantity,
                      subtotalCop: item.subtotalCop,
                    })),
                  },
                },
                include: { items: true },
              });

              // Crear pago pending
              const payment = await tx.payment.create({
                data: {
                  orderId: order.id,
                  provider: params.provider,
                  status: 'PENDING',
                  amountCop: params.totalCop,
                  providerReference: params.providerReference,
                  idempotencyKey: params.paymentIdempotencyKey,
                },
              });

              return {
                orderId: order.id,
                orderNumber: order.orderNumber,
                paymentId: payment.id,
                createdAt: order.createdAt.toISOString(),
              };
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
      const message = error instanceof Error ? error.message : String(error);

      // Traducir errores de dominio conocidos
      if (message === 'ORDER_ALREADY_EXISTS') {
        return { ok: false, error: CheckoutErrors.orderAlreadyExists() } as any;
      }
      if (message === 'RESERVATION_NOT_ACTIVE') {
        return { ok: false, error: CheckoutErrors.reservationNotActive() } as any;
      }

      // Error técnico no clasificable
      return { ok: false, error: CheckoutErrors.technicalFailure() } as any;
    }
  }
}
