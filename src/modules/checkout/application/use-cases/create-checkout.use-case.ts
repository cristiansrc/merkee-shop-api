import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartRepositoryPort } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../../cart-reservation/domain/ports/session-lookup.port';
import { CartIdempotencyPort } from '../../../cart-reservation/domain/ports/cart-idempotency.port';
import { CheckoutProductLookupPort } from '../../domain/ports/checkout-product-lookup.port';
import { CheckoutUnitOfWorkPort } from '../../domain/ports/checkout-unit-of-work.port';
import { CheckoutErrors } from '../../domain/checkout-errors';
import { PaymentProviderSelector } from '../../../payments/domain/ports/payment-provider-selector';
import { PaymentProviderName } from '../../../payments/domain/ports/payment-provider.port';

/**
 * Puerto de entrada (caso de uso) de creación de checkout.
 *
 * Cliente únicamente; IVA `floor((subtotal*19+50)/100)`, entrega 5000, total
 * exacto (AC-08 / ADR-009). Crea la orden/pago pending y obtiene la URL de
 * checkout del proveedor seleccionado (Wompi/Mercado Pago).
 */
export interface CreateCheckoutUseCase {
  execute(command: CreateCheckoutCommand): Promise<Result<CreateCheckoutResult, DomainError>>;
}

/** Comando de entrada del caso de uso. */
export interface CreateCheckoutCommand {
  readonly sessionId: string;
  readonly userId: string;
  readonly deliveryAddress: DeliveryAddress;
  readonly paymentProvider: PaymentProviderName;
  readonly idempotencyKey: string;
  readonly canonicalBody: string;
  /**
   * Sesión de carrito de invitado previa (cookie `merkee_cart_session`), si el
   * cliente aún la conserva. Se usa como fallback: si la sesión autenticada no
   * tiene carrito, el carrito guest se transfiere antes de fallar.
   */
  readonly guestSessionId?: string;
}

/** Dirección de entrega (snapshot de orden, no perfil). */
export interface DeliveryAddress {
  readonly recipientName: string;
  readonly line1: string;
  readonly city: string;
  readonly phone: string;
}

/** Ítem de orden resultado (snapshot). */
export interface OrderItemResult {
  readonly productId: string;
  readonly productName: string;
  readonly unit: string;
  readonly unitPriceCop: number;
  readonly quantity: number;
  readonly subtotalCop: number;
}

/**
 * Resultado de éxito del checkout. JSON-safe (cifras COP como `number`,
 * dentro del rango seguro de JS) para poder persistirse en `idempotency_records`
 * y reconstruir el replay sin BigInt.
 */
export interface CreateCheckoutResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly paymentId: string;
  readonly itemsSubtotalCop: number;
  readonly deliveryFeeCop: number;
  readonly ivaCop: number;
  readonly taxRateBasisPoints: number;
  readonly totalCop: number;
  readonly items: readonly OrderItemResult[];
  readonly delivery: DeliveryAddress;
  readonly paymentProvider: PaymentProviderName;
  readonly providerReference: string | null;
  readonly providerCheckoutUrl: string;
  readonly createdAt: string;
}

/**
 * Implementación del caso de uso de checkout (Master Spec AC-08 / ADR-009).
 *
 * Flujo:
 * 1. Valida que el actor sea cliente (no admin)
 * 2. Carga el carrito con ítems y reservas desde el servidor; si no existe,
 *    intenta transferir un carrito guest válido (cookie) antes de fallar
 * 3. Valida que existan ítems y que todas las reservas estén ACTIVE
 * 4. Recalcula precios desde el servidor (no confía en clientes)
 * 5. Calcula IVA = floor((subtotal*19+50)/100), entrega=5000
 * 6. Llama al proveedor de pago para obtener la URL de checkout (fuera de la
 *    transacción: un fallo del proveedor no deja estado parcial)
 * 7. Ejecuta transacción atómica:
 *    - Verifica idempotencia/replay
 *    - Convierte reservas ACTIVE → CHECKOUT_PENDING
 *    - Crea orden + pago pending con el proveedor y referencia
 *    - Registra idempotencia
 */
export class CreateCheckoutUseCaseImpl implements CreateCheckoutUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: CheckoutProductLookupPort,
    private readonly unitOfWork: CheckoutUnitOfWorkPort,
    private readonly providerSelector: PaymentProviderSelector,
    private readonly idempotency: CartIdempotencyPort,
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
    let cartWithItems = await this.cartRepo.findCartWithItems(command.sessionId);

    // 2b. Fallback guest→cliente: si la sesión autenticada no tiene carrito
    //     pero aún existe una cookie guest válida con carrito, se transfiere
    //     antes de fallar (la promoción pudo no ocurrir en login/registro).
    if (!cartWithItems && command.guestSessionId) {
      await this.transferGuestCartIfValid(command.guestSessionId, command.sessionId);
      cartWithItems = await this.cartRepo.findCartWithItems(command.sessionId);
    }

    if (!cartWithItems) {
      // Sin carrito → 422 CHECKOUT_NOT_ALLOWED (no 410 SESSION_EXPIRED).
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

    // Si un producto ya no está disponible (soft-delete/eliminación entre la
    // reserva y el checkout), no se puede recalcular de forma confiable.
    for (const item of items) {
      if (!products.has(item.productId)) {
        return fail(CheckoutErrors.resourceNotFound());
      }
    }

    let itemsSubtotalCop = 0n;
    const recalculatedItems = items.map((item) => {
      const product = products.get(item.productId)!;

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

    // 6b. Pre-check de idempotencia ANTES de llamar al proveedor: un replay no
    //     debe crear un pago externo duplicado ni huérfano. Si ya existe un
    //     registro para esta key, se devuelve el resultado cacheado (o 409 si el
    //     body diverge) sin invocar al proveedor ni abrir la transacción.
    const idempotencyScope = `checkout:${command.userId}`;
    const preExisting = await this.idempotency.find(idempotencyScope, command.idempotencyKey);
    if (preExisting) {
      const currentHash = await this.hashBody(command.canonicalBody);
      if (preExisting.bodyHash !== currentHash) {
        return fail(CheckoutErrors.idempotencyKeyReused());
      }
      return ok(preExisting.responseJson as CreateCheckoutResult);
    }

    // 7. Llamar al proveedor de pago para obtener la URL de checkout.
    //    Fuera de la transacción: un fallo de red/proveedor no deja orden/pago
    //    ni reservas convertidas (no hay estado parcial).
    let providerReference: string | null = null;
    let providerCheckoutUrl = '';
    try {
      const provider = this.providerSelector.resolve(command.paymentProvider);
      const providerResult = await provider.createPayment({
        orderId: cart.id,
        amountCop: Number(totalCop),
        idempotencyKey: command.idempotencyKey,
      });
      providerReference = providerResult.providerPaymentId;
      providerCheckoutUrl = providerResult.checkoutUrl;
    } catch {
      return fail(CheckoutErrors.technicalFailure());
    }

    // 8. Ejecutar transacción atómica
    const result = await this.unitOfWork.run(async (ctx): Promise<Result<CreateCheckoutResult, DomainError>> => {
      // Verificar idempotencia (autoritativo, con FOR UPDATE para concursos)
      const existingRecord = await ctx.idempotency.findForUpdate(
        idempotencyScope,
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

      // Crear orden + pago pending (única por carrito)
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
        provider: command.paymentProvider,
        providerReference,
        paymentIdempotencyKey: command.idempotencyKey,
        items: recalculatedItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          unitPriceCop: item.unitPriceCop,
          quantity: item.quantity,
          subtotalCop: item.subtotalCop,
        })),
      });

      // Convertir reservas ACTIVE → CHECKOUT_PENDING
      await ctx.reservationConverter.convertActiveToCheckoutPending(cart.id);

      // Registrar idempotencia
      const bodyHash = await this.hashBody(command.canonicalBody);
      const responseJson: CreateCheckoutResult = {
        orderId: orderExists.orderId,
        orderNumber: orderExists.orderNumber,
        paymentId: orderExists.paymentId,
        itemsSubtotalCop: Number(itemsSubtotalCop),
        deliveryFeeCop: Number(deliveryFeeCop),
        ivaCop: Number(ivaCop),
        taxRateBasisPoints: 1900,
        totalCop: Number(totalCop),
        items: recalculatedItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          unitPriceCop: Number(item.unitPriceCop),
          quantity: item.quantity,
          subtotalCop: Number(item.subtotalCop),
        })),
        delivery: {
          recipientName: command.deliveryAddress.recipientName,
          line1: command.deliveryAddress.line1,
          city: command.deliveryAddress.city,
          phone: command.deliveryAddress.phone,
        },
        paymentProvider: command.paymentProvider,
        providerReference,
        providerCheckoutUrl,
        createdAt: orderExists.createdAt,
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

  /**
   * Transfiere el carrito guest a la sesión autenticada SOLO si la cookie guest
   * sigue apuntando a una sesión GUEST válida (existente, no revocada, no
   * expirada) y dicha sesión tiene un carrito con ítems. Idempotente: si no hay
   * carrito guest o la sesión no es válida, no-op.
   */
  private async transferGuestCartIfValid(
    guestSessionId: string,
    targetSessionId: string,
  ): Promise<void> {
    if (guestSessionId === targetSessionId) return;

    const guestSession = await this.sessionLookup.findById(guestSessionId);
    if (!guestSession) return;
    if (guestSession.revokedAt !== null) return;
    if (guestSession.sessionKind !== 'GUEST') return;
    if (guestSession.expiresAt <= new Date()) return;

    const guestCart = await this.cartRepo.findCartWithItems(guestSessionId);
    if (!guestCart || guestCart.items.length === 0) return;

    await this.cartRepo.transferCartToSession(guestSessionId, targetSessionId);
  }
}
