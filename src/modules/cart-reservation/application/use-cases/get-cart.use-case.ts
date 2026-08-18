import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartErrors } from '../../domain/cart-errors';
import {
  CartRepositoryPort,
  CartWithItemsRecord,
} from '../../domain/ports/cart-repository.port';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CartProduct } from '../../domain/models';
import { ProductLookupPort } from '../../domain/ports/product-lookup.port';

/** Resultado del caso de uso GetCart. */
export interface GetCartResult {
  readonly cartWithItems: CartWithItemsRecord;
  readonly products: Map<string, CartProduct>;
}

/**
 * Caso de uso: obtener el carrito del servidor (AC-02, AC-03).
 *
 * Guest y cliente pueden operar un carrito servidor con reserva.
 * Un admin recibe 403 ADMIN_STOREFRONT_PURCHASE_FORBIDDEN.
 * Un acceso válido renueva la expiración de 10 minutos.
 * Una sesión/reserva expirada devuelve 410 Gone.
 */
export class GetCartUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly sessionLookup: SessionLookupPort,
    private readonly productLookup: ProductLookupPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(sessionId: string): Promise<Result<GetCartResult, DomainError>> {
    // 1. Verificar sesión
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

    // 2. Verificar rol (admin → 403)
    if (session.userId) {
      const user = await this.sessionLookup.findUserById(session.userId);
      if (user && user.role === 'admin') {
        return fail(CartErrors.adminStorefrontPurchaseForbidden());
      }
      if (user && user.mustChangePassword) {
        return fail(CartErrors.initialPasswordChangeRequired());
      }
    }

    // 3. Buscar carrito
    const cartWithItems = await this.cartRepo.findCartWithItems(sessionId);
    if (!cartWithItems) {
      // Sin carrito → devolver carrito vacío
      return fail(CartErrors.sessionExpired());
    }

    // 4. Verificar expiración de reserva
    if (
      cartWithItems.cart.status === 'ACTIVE' &&
      cartWithItems.cart.reservationExpiresAt &&
      cartWithItems.cart.reservationExpiresAt <= now
    ) {
      return fail(CartErrors.cartReservationExpired());
    }

    // 5. Cargar productos para el response
    const products = new Map<string, CartProduct>();
    for (const item of cartWithItems.items) {
      if (!products.has(item.productId)) {
        const product = await this.productLookup.findActiveForCart(item.productId);
        if (product) {
          products.set(item.productId, product);
        }
      }
    }

    // 6. Renovar sesión (now + 10m)
    await this.cartRepo.touchSession(sessionId, now);

    return ok({ cartWithItems, products });
  }
}
