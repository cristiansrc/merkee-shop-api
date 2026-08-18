import { createHash } from 'crypto';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';
import { CartRepositoryPort } from '../../domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { ProductLookupPort } from '../../domain/ports/product-lookup.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartIdempotencyPort } from '../../domain/ports/cart-idempotency.port';
import { CartUnitOfWorkPort } from '../../domain/ports/cart-unit-of-work.port';

/** Comando de entrada para eliminar ítem del carrito. */
export interface RemoveCartItemCommand {
  readonly sessionId: string;
  readonly productId: string;
  readonly idempotencyKey: string;
  readonly canonicalBody: string;
}

/** TTL de reserva en minutos. */
const RESERVATION_TTL_MINUTES = 10;

/**
 * Caso de uso: eliminar el ítem del carrito y liberar su reserva (AC-02).
 *
 * Marca la reserva como liberada y decrementa stock_reserved atómicamente.
 * Una solicitud repetida con la misma clave de idempotencia tiene éxito
 * sin un segundo decremento.
 */
export class RemoveCartItemUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: ProductLookupPort,
    private readonly clock: ClockPort,
    private readonly idempotency: CartIdempotencyPort,
    private readonly unitOfWork: CartUnitOfWorkPort,
  ) {}

  async execute(
    command: RemoveCartItemCommand,
  ): Promise<Result<void, DomainError>> {
    const { sessionId, productId, idempotencyKey, canonicalBody } = command;

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
    const scope = `cart-remove:${sessionId}`;
    const bodyHash = createHash('sha256').update(canonicalBody).digest('hex');
    const existing = await this.idempotency.find(scope, idempotencyKey);
    if (existing) {
      if (existing.bodyHash === bodyHash) {
        // Replay: ya eliminado, éxito sin segundo decremento
        return ok(undefined);
      }
      return fail(CartErrors.idempotencyKeyReused());
    }

    // 3. Ejecutar eliminación atómica
    const result = await this.unitOfWork.run(async (ctx) => {
      const existingInTx = await ctx.idempotency.findForUpdate(scope, idempotencyKey);
      if (existingInTx) {
        if (existingInTx.bodyHash === bodyHash) {
          return ok(undefined);
        }
        return fail(CartErrors.idempotencyKeyReused());
      }

      const cartWithItems = await ctx.cartRepo.findCartWithItems(sessionId);
      if (!cartWithItems) return fail(CartErrors.sessionExpired());

      const cartItem = await ctx.cartRepo.findCartItem(cartWithItems.cart.id, productId);
      if (!cartItem) return fail(CartErrors.cartItemNotFound());

      // Buscar la reserva asociada
      const itemWithReservation = cartWithItems.items.find(
        (i) => i.productId === productId && i.reservation,
      );
      if (itemWithReservation?.reservation) {
        await ctx.stockReservation.release(itemWithReservation.reservation.id);
      }

      // Eliminar ítem
      await ctx.cartRepo.deleteCartItem(cartItem.id);

      // Recalcular totales
      const allItems = await ctx.cartRepo.findCartWithItems(sessionId);
      if (allItems) {
        let itemsSubtotal = 0n;
        for (const item of allItems.items) {
          itemsSubtotal += item.subtotalCop;
        }
        const iva = (itemsSubtotal * 19n + 50n) / 100n;
        const total = itemsSubtotal + 5000n + iva;
        const expiresAt = allItems.items.length > 0
          ? new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000)
          : null;
        await ctx.cartRepo.updateCartTotals(cartWithItems.cart.id, {
          itemsSubtotalCop: itemsSubtotal,
          ivaCop: iva,
          totalCop: total,
          reservationExpiresAt: expiresAt,
        });
      }

      await ctx.cartRepo.touchSession(sessionId, now);

      await ctx.idempotency.save({
        scope,
        idempotencyKey,
        bodyHash,
        responseJson: { status: 204 },
      });

      return ok(undefined);
    });

    return result as Result<void, DomainError>;
  }
}
