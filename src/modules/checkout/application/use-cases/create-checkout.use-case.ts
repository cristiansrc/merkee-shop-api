import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartRepositoryPort } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../../cart-reservation/domain/ports/session-lookup.port';
import { CheckoutProductLookupPort } from '../../domain/ports/checkout-product-lookup.port';
import { CheckoutUnitOfWorkPort } from '../../domain/ports/checkout-unit-of-work.port';
import { CheckoutErrors } from '../../domain/checkout-errors';

/**
 * Puerto de entrada (caso de uso) de creación de checkout.
 *
 * Cliente únicamente; IVA `floor((subtotal*19+50)/100)`, entrega 5000, total
 * exacto (AC-08 / ADR-009).
 */
export interface CreateCheckoutUseCase {
  execute(command: CreateCheckoutCommand): Promise<Result<CreateCheckoutResult, DomainError>>;
}

/** Comando de entrada del caso de uso. */
export interface CreateCheckoutCommand {
  readonly sessionId: string;
  readonly userId: string;
  readonly deliveryAddress: DeliveryAddress;
  readonly idempotencyKey: string;
  readonly canonicalBody: string;
}

/** Dirección de entrega (snapshot de orden, no perfil). */
export interface DeliveryAddress {
  readonly recipientName: string;
  readonly line1: string;
  readonly city: string;
  readonly phone: string;
}

/** Resultado de éxito del checkout. */
export interface CreateCheckoutResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly paymentId: string;
  readonly itemsSubtotalCop: bigint;
  readonly deliveryFeeCop: bigint;
  readonly ivaCop: bigint;
  readonly totalCop: bigint;
}

/**
 * Implementación del caso de uso de checkout (Master Spec AC-08 / ADR-009).
 *
 * Flujo:
 * 1. Valida que el actor sea cliente (no admin)
 * 2. Carga el carrito con ítems y reservas desde el servidor
 * 3. Valida que existan ítems y que todas las reservas estén ACTIVE
 * 4. Recalcula precios desde el servidor (no confía en clientes)
 * 5. Calcula IVA = floor((subtotal*19+50)/100), entrega=5000
 * 6. Ejecuta transacción atómica:
 *    - Convierte reservas ACTIVE → CHECKOUT_PENDING
 *    - Crea orden + pago pending
 *    - Registra idempotencia
 */
export class CreateCheckoutUseCaseImpl implements CreateCheckoutUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: CheckoutProductLookupPort,
    private readonly unitOfWork: CheckoutUnitOfWorkPort,
  ) {}

  async execute(
    command: CreateCheckoutCommand,
  ): Promise<Result<CreateCheckoutResult, DomainError>> {
    // 1. Validar sesión y rol
    const session = await this.sessionLookup.findById(command.sessionId);
    if (!session) {
      return fail(CheckoutErrors.sessionExpired());
    }

    if (session.revokedAt) {
      return fail(CheckoutErrors.sessionExpired());
    }

    // Verificar que no sea admin (AC-03)
    if (session.userId) {
      const user = await this.sessionLookup.findUserById(session.userId);
      if (user && user.role === 'admin') {
        return fail(CheckoutErrors.adminStorefrontPurchaseForbidden());
      }
    }

    // 2. Cargar carrito con ítems y reservas
    const cartWithItems = await this.cartRepo.findCartWithItems(command.sessionId);
    if (!cartWithItems) {
      return fail(CheckoutErrors.checkoutNotAllowed());
    }

    const { cart, items } = cartWithItems;

    // 3. Validar que existan ítems
    if (items.length === 0) {
      return fail(CheckoutErrors.checkoutNotAllowed());
    }

    // 4. Validar que todas las reservas estén ACTIVE
    for (const item of items) {
      if (!item.reservation) {
        return fail(CheckoutErrors.reservationNotActive());
      }
      if (item.reservation.status !== 'ACTIVE') {
        return fail(CheckoutErrors.reservationNotActive());
      }
    }

    // 5. Recalcular precios desde el servidor
    const productIds = items.map((item) => item.productId);
    const products = await this.productLookup.findByIds(productIds);

    let itemsSubtotalCop = 0n;
    const recalculatedItems = items.map((item) => {
      const product = products.get(item.productId);
      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      // Usar salePriceCop si es mayor a 0, sino regularPriceCop
      const unitPriceCop =
        product.salePriceCop > 0n ? product.salePriceCop : product.regularPriceCop;
      const subtotalCop = unitPriceCop * BigInt(item.quantity);
      itemsSubtotalCop += subtotalCop;

      return {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        unitPriceCop,
        quantity: item.quantity,
        subtotalCop,
      };
    });

    // 6. Calcular IVA y totales (ADR-009)
    const ivaCop = (itemsSubtotalCop * 19n + 50n) / 100n;
    const deliveryFeeCop = 5000n;
    const totalCop = itemsSubtotalCop + deliveryFeeCop + ivaCop;

    // 7. Ejecutar transacción atómica
    const result = await this.unitOfWork.run(async (ctx): Promise<Result<CreateCheckoutResult, DomainError>> => {
      // Verificar idempotencia
      const existingRecord = await ctx.idempotency.findForUpdate(
        `checkout:${command.userId}`,
        command.idempotencyKey,
      );

      if (existingRecord) {
        // Replay: verificar que el body hash coincida
        const currentHash = await this.hashBody(command.canonicalBody);
        if (existingRecord.bodyHash !== currentHash) {
          return fail(CheckoutErrors.idempotencyKeyReused());
        }
        // Retornar resultado del replay
        const replayResult = existingRecord.responseJson as CreateCheckoutResult;
        return ok(replayResult);
      }

      // Verificar que no exista ya una orden para este carrito
      const orderExists = await ctx.orderCreator.createOrderAndPayment({
        cartId: cart.id,
        userId: command.userId,
        itemsSubtotalCop,
        deliveryFeeCop,
        ivaCop,
        taxRateBasisPoints: 1900,
        totalCop,
        deliveryRecipientName: command.deliveryAddress.recipientName,
        deliveryLine1: command.deliveryAddress.line1,
        deliveryCity: command.deliveryAddress.city,
        deliveryPhone: command.deliveryAddress.phone,
        items: recalculatedItems,
      });

      // Convertir reservas ACTIVE → CHECKOUT_PENDING
      await ctx.reservationConverter.convertActiveToCheckoutPending(cart.id);

      // Registrar idempotencia
      const bodyHash = await this.hashBody(command.canonicalBody);
      const responseJson: CreateCheckoutResult = {
        orderId: orderExists.orderId,
        orderNumber: orderExists.orderNumber,
        paymentId: orderExists.paymentId,
        itemsSubtotalCop,
        deliveryFeeCop,
        ivaCop,
        totalCop,
      };

      await ctx.idempotency.save({
        scope: `checkout:${command.userId}`,
        idempotencyKey: command.idempotencyKey,
        bodyHash,
        responseJson,
      });

      return ok(responseJson);
    });

    return result;
  }

  /** Hash SHA-256 del body canónico para idempotencia. */
  private async hashBody(body: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(body).digest('hex');
  }
}
