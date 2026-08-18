import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { CartTransitionGuestToAdminPort } from '../../domain/ports/cart-transition-guest-to-admin.port';
import { CartRepositoryPort } from '../../domain/ports/cart-repository.port';
import { StockReservationPort } from '../../domain/ports/stock-reservation.port';

/**
 * Caso de uso: transición guest→admin (ADR-014 / AC-04).
 *
 * Implementa la transición destructiva documentada en ADR-014:
 * - Libera todas las reservas ACTIVE de la sesión guest.
 * - Cierra el carrito (ACTIVE → CLOSED).
 * - Conserva CHECKOUT_PENDING hasta pago/reconciliación.
 *
 * Este caso de uso se ejecuta desde el módulo `identity` cuando
 * una sesión guest se autentica como admin.
 *
 * REGLA: no incluye la creación de sesión admin (eso lo maneja
 * identity). Solo libera reservas y cierra carrito.
 */
export class TransitionGuestToAdminUseCase {
  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly stockReservation: StockReservationPort,
  ) {}

  /**
   * Libera todas las reservas ACTIVE y cierra el carrito de la sesión guest.
   *
   * Operación idempotente: si no hay carrito o reservas, es no-op.
   * CHECKOUT_PENDING se conserva.
   */
  async execute(guestSessionId: string): Promise<Result<void, DomainError>> {
    try {
      // 1. Buscar carrito de la sesión guest
      const cartWithItems = await this.cartRepo.findCartWithItems(
        guestSessionId,
      );

      if (!cartWithItems) {
        // Sin carrito → no-op idempotente
        return ok(undefined);
      }

      // 2. Liberar todas las reservas ACTIVE del carrito
      // Solo libera ACTIVE; CHECKOUT_PENDING permanece
      await this.stockReservation.releaseAllForCart(cartWithItems.cart.id);

      // 3. Cerrar el carrito (ACTIVE → CLOSED)
      await this.cartRepo.closeCart(guestSessionId);

      return ok(undefined);
    } catch {
      // Error técnico: traducir a DomainError sin PII
      return fail({
        code: 'TECHNICAL_DEPENDENCY_FAILURE' as any,
        kind: 'technical',
        messageKey: 'technical.dependency.failure',
      });
    }
  }
}
