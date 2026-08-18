import { createHash } from 'crypto';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';
import {
  CartRepositoryPort,
  CartWithItemsRecord,
} from '../../domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { ProductLookupPort } from '../../domain/ports/product-lookup.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartIdempotencyPort } from '../../domain/ports/cart-idempotency.port';
import { CartUnitOfWorkPort } from '../../domain/ports/cart-unit-of-work.port';
import { CartProduct } from '../../domain/models';

/** Comando de entrada para agregar ítem al carrito. */
export interface AddCartItemCommand {
  readonly sessionId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly canonicalBody: string;
}

/** Resultado del caso de uso AddCartItem. */
export interface AddCartItemSuccess {
  readonly cartWithItems: CartWithItemsRecord;
  readonly products: Map<string, CartProduct>;
  readonly createdCartItem: boolean;
}

/** TTL de reserva en minutos. */
const RESERVATION_TTL_MINUTES = 10;

/**
 * Caso de uso: agregar cantidad de producto al carrito y reservar stock (AC-02).
 *
 * Guest y cliente pueden operar un carrito servidor con reserva.
 * Un admin recibe 403 ADMIN_STOREFRONT_PURCHASE_FORBIDDEN.
 * La reserva es atómica: lock por product_id ASC, valida disponibilidad
 * y actualiza products.stock_reserved.
 * La sesión/carrito/reserva ACTIVE se renuevan a now()+10m.
 * Idempotencia: replay = misma respuesta; divergente = 409.
 */
export class AddCartItemUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: ProductLookupPort,
    private readonly clock: ClockPort,
    private readonly idempotency: CartIdempotencyPort,
    private readonly unitOfWork: CartUnitOfWorkPort,
  ) {}

  async execute(
    command: AddCartItemCommand,
  ): Promise<Result<AddCartItemSuccess, DomainError>> {
    const { sessionId, productId, quantity, idempotencyKey, canonicalBody } =
      command;

    // 1. Verificar sesión y rol
    const session = await this.sessionLookup.findById(sessionId);
    if (!session) {
      return fail(CartErrors.sessionExpired());
    }
    if (session.revokedAt) {
      return fail(CartErrors.sessionExpired());
    }
    const now = this.clock.now();
    if (session.expiresAt <= now) {
      return fail(CartErrors.sessionExpired());
    }
    if (session.userId) {
      const user = await this.sessionLookup.findUserById(session.userId);
      if (user && user.role === 'admin') {
        return fail(CartErrors.adminStorefrontPurchaseForbidden());
      }
      if (user && user.mustChangePassword) {
        return fail(CartErrors.initialPasswordChangeRequired());
      }
    }

    // 2. Verificar idempotencia FUERA de la transacción
    const scope = `cart-add:${sessionId}`;
    const bodyHash = createHash('sha256')
      .update(canonicalBody)
      .digest('hex');
    const existing = await this.idempotency.find(scope, idempotencyKey);
    if (existing) {
      if (existing.bodyHash === bodyHash) {
        // Replay: devolver respuesta almacenada
        const replayResult = existing.responseJson as AddCartItemSuccess;
        return ok(replayResult);
      }
      // Divergente: 409
      return fail(CartErrors.idempotencyKeyReused());
    }

    // 3. Verificar producto existe y activo
    const product = await this.productLookup.findActiveForCart(productId);
    if (!product) {
      return fail(CartErrors.resourceNotFound());
    }

    // 4. Ejecutar reserva atómica dentro de la UoW
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

    const result = await this.unitOfWork.run(async (ctx) => {
      // Re-verificar idempotencia dentro de la transacción (carrera)
      const existingInTx = await ctx.idempotency.findForUpdate(scope, idempotencyKey);
      if (existingInTx) {
        if (existingInTx.bodyHash === bodyHash) {
          return ok(existingInTx.responseJson as AddCartItemSuccess);
        }
        return fail(CartErrors.idempotencyKeyReused());
      }

      // Buscar o crear carrito
      let cartWithItems = await ctx.cartRepo.findCartWithItems(sessionId);
      let cartId: string;
      if (!cartWithItems) {
        const newCart = await ctx.cartRepo.createCart(sessionId);
        cartId = newCart.id;
        cartWithItems = { cart: { ...newCart, sessionId, status: 'ACTIVE', itemsSubtotalCop: 0n, deliveryFeeCop: 5000n, ivaCop: 0n, taxRateBasisPoints: 1900, totalCop: 5000n, reservationExpiresAt: null } as any, items: [] };
      } else {
        cartId = cartWithItems.cart.id;
      }

      // Verificar si el producto ya está en el carrito
      const existingItem = await ctx.cartRepo.findCartItem(cartId, productId);
      if (existingItem) {
        // Ya existe: ajustar cantidad (sumar)
        const newQuantity = existingItem.quantity + quantity;
        const unitPrice = product.salePriceCop > 0n ? product.salePriceCop : product.regularPriceCop;
        const newSubtotal = unitPrice * BigInt(newQuantity);

        await ctx.cartRepo.updateCartItemQuantity(
          existingItem.id,
          newQuantity,
          newSubtotal,
        );

        // Ajustar reserva de stock
        const reservation = cartWithItems.items.find(
          (i) => i.productId === productId && i.reservation,
        );
        if (reservation?.reservation) {
          await ctx.stockReservation.adjustReservation({
            reservationId: reservation.reservation.id,
            productId,
            newQuantity,
            expiresAt,
          });
        }
      } else {
        // Nuevo ítem: crear en transacción
        const unitPrice = product.salePriceCop > 0n ? product.salePriceCop : product.regularPriceCop;
        const subtotal = unitPrice * BigInt(quantity);

        const newItem = await ctx.cartRepo.createCartItem({
          cartId,
          productId,
          quantity,
          unitPriceCop: unitPrice,
          subtotalCop: subtotal,
        });

        // Reservar stock atómicamente
        await ctx.stockReservation.reserve({
          cartId,
          cartItemId: newItem.id,
          productId,
          quantity,
          expiresAt,
        });
      }

      // Recalcular totales del carrito
      const allItems = await ctx.cartRepo.findCartWithItems(sessionId);
      if (allItems) {
        let itemsSubtotal = 0n;
        for (const item of allItems.items) {
          itemsSubtotal += item.subtotalCop;
        }
        const iva = (itemsSubtotal * 19n + 50n) / 100n;
        const total = itemsSubtotal + 5000n + iva;

        await ctx.cartRepo.updateCartTotals(cartId, {
          itemsSubtotalCop: itemsSubtotal,
          ivaCop: iva,
          totalCop: total,
          reservationExpiresAt: expiresAt,
        });
      }

      // Renovar sesión
      await ctx.cartRepo.touchSession(sessionId, now);

      // Persistir idempotencia
      const responseJson: AddCartItemSuccess = {
        cartWithItems: allItems!,
        products: new Map([[productId, product]]),
        createdCartItem: !existingItem,
      };

      await ctx.idempotency.save({
        scope,
        idempotencyKey,
        bodyHash,
        responseJson,
      });

      return ok(responseJson);
    });

    return result as Result<AddCartItemSuccess, DomainError>;
  }
}
