import { createHash } from 'crypto';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';
import { CartRepositoryPort, CartWithItemsRecord } from '../../domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { ProductLookupPort } from '../../domain/ports/product-lookup.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartIdempotencyPort } from '../../domain/ports/cart-idempotency.port';
import { CartUnitOfWorkPort } from '../../domain/ports/cart-unit-of-work.port';
import { CartProduct } from '../../domain/models';

/** Comando de entrada para fijar cantidad de ítem. */
export interface SetCartItemQuantityCommand {
  readonly sessionId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly canonicalBody: string;
}

/** Resultado del caso de uso SetCartItemQuantity. */
export interface SetCartItemQuantitySuccess {
  readonly cartWithItems: CartWithItemsRecord;
  readonly products: Map<string, CartProduct>;
}

/** TTL de reserva en minutos. */
const RESERVATION_TTL_MINUTES = 10;

/**
 * Caso de uso: fijar la cantidad reservada para un producto existente (AC-02).
 *
 * Cero no es válido y debe usarse DELETE.
 * Ajusta atómicamente el delta de la reserva y stock_reserved.
 * Una disminución libera el delta.
 * El acceso exitoso renueva la expiración de 10 minutos.
 */
export class SetCartItemQuantityUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: ProductLookupPort,
    private readonly clock: ClockPort,
    private readonly idempotency: CartIdempotencyPort,
    private readonly unitOfWork: CartUnitOfWorkPort,
  ) {}

  async execute(
    command: SetCartItemQuantityCommand,
  ): Promise<Result<SetCartItemQuantitySuccess, DomainError>> {
    const { sessionId, productId, quantity, idempotencyKey, canonicalBody } = command;

    // 1. Verificar sesión y rol
    const session = await this.sessionLookup.findById(sessionId);
    if (!session) return fail(CartErrors.sessionExpired());
    if (session.revokedAt) return fail(CartErrors.sessionExpired());
    const now = this.clock.now();
    if (session.expiresAt <= now) return fail(CartErrors.sessionExpired());
    if (session.userId) {
      const user = await this.sessionLookup.findUserById(session.userId);
      if (user && user.role === 'admin') return fail(CartErrors.adminStorefrontPurchaseForbidden());
      if (user && user.mustChangePassword) return fail(CartErrors.initialPasswordChangeRequired());
    }

    // 2. Verificar idempotencia
    const scope = `cart-set-qty:${sessionId}`;
    const bodyHash = createHash('sha256').update(canonicalBody).digest('hex');
    const existing = await this.idempotency.find(scope, idempotencyKey);
    if (existing) {
      if (existing.bodyHash === bodyHash) {
        return ok(existing.responseJson as SetCartItemQuantitySuccess);
      }
      return fail(CartErrors.idempotencyKeyReused());
    }

    // 3. Ejecutar ajuste atómico
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

    const result = await this.unitOfWork.run(async (ctx) => {
      const existingInTx = await ctx.idempotency.findForUpdate(scope, idempotencyKey);
      if (existingInTx) {
        if (existingInTx.bodyHash === bodyHash) {
          return ok(existingInTx.responseJson as SetCartItemQuantitySuccess);
        }
        return fail(CartErrors.idempotencyKeyReused());
      }

      const cartWithItems = await ctx.cartRepo.findCartWithItems(sessionId);
      if (!cartWithItems) return fail(CartErrors.sessionExpired());

      // Verificar que el producto esté en el carrito
      const cartItem = await ctx.cartRepo.findCartItem(cartWithItems.cart.id, productId);
      if (!cartItem) return fail(CartErrors.cartItemNotFound());

      // Buscar la reserva asociada
      const itemWithReservation = cartWithItems.items.find(
        (i) => i.productId === productId && i.reservation,
      );
      if (!itemWithReservation?.reservation) {
        return fail(CartErrors.reservationNotActive());
      }

      // Ajustar reserva de stock
      await ctx.stockReservation.adjustReservation({
        reservationId: itemWithReservation.reservation.id,
        productId,
        newQuantity: quantity,
        expiresAt,
      });

      // Actualizar cantidad del ítem
      const product = (await this.productLookup.findActiveForCart(productId))!;
      const unitPrice = product.salePriceCop > 0n ? product.salePriceCop : product.regularPriceCop;
      const newSubtotal = unitPrice * BigInt(quantity);
      await ctx.cartRepo.updateCartItemQuantity(cartItem.id, quantity, newSubtotal);

      // Recalcular totales
      const allItems = await ctx.cartRepo.findCartWithItems(sessionId);
      if (allItems) {
        let itemsSubtotal = 0n;
        for (const item of allItems.items) {
          itemsSubtotal += item.subtotalCop;
        }
        const iva = (itemsSubtotal * 19n + 50n) / 100n;
        const total = itemsSubtotal + 5000n + iva;
        await ctx.cartRepo.updateCartTotals(cartWithItems.cart.id, {
          itemsSubtotalCop: itemsSubtotal,
          ivaCop: iva,
          totalCop: total,
          reservationExpiresAt: expiresAt,
        });
      }

      await ctx.cartRepo.touchSession(sessionId, now);

      const responseJson: SetCartItemQuantitySuccess = {
        cartWithItems: allItems!,
        products: await this.productLookup.findActiveForCartByIds(
          allItems!.items.map((i) => i.productId),
        ),
      };

      await ctx.idempotency.save({
        scope,
        idempotencyKey,
        bodyHash,
        responseJson,
      });

      return ok(responseJson);
    });

    return result as Result<SetCartItemQuantitySuccess, DomainError>;
  }
}
