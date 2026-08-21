import { Injectable, Logger } from '@nestjs/common';
import { CartRepositoryPort } from '../../domain/ports/cart-repository.port';
import { StockReservationPort } from '../../domain/ports/stock-reservation.port';
import type { CartReservationPort } from '../../../identity/domain/ports/cart-reservation.port';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../../identity/domain/identity-errors';

/**
 * Adapter real de transición guest→admin (infrastructure).
 *
 * Implementa CartReservationPort del módulo identity usando los
 * puertos del módulo cart-reservation.
 *
 * Captura excepciones técnicas en su límite, las registra sin PII
 * y las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 * La aplicación nunca captura excepciones técnicas.
 *
 * ADR-014: admin no es comprador; la promoción guest→admin es
 * destructiva para ACTIVE y conserva CHECKOUT_PENDING.
 */
@Injectable()
export class RealCartReservationAdapter implements CartReservationPort {
  private readonly logger = new Logger(RealCartReservationAdapter.name);

  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly stockReservation: StockReservationPort,
  ) {}

  async releaseActiveReservations(sessionId: string): Promise<Result<void, DomainError>> {
    try {
      // Buscar carrito por sesión para obtener el cartId
      const cartWithItems = await this.cartRepo.findCartWithItems(sessionId);
      if (!cartWithItems) {
        return ok(undefined); // No-op: sin carrito
      }

      // Liberar todas las reservas ACTIVE del carrito
      await this.stockReservation.releaseAllForCart(cartWithItems.cart.id);
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`releaseActiveReservations failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async closeCart(sessionId: string): Promise<Result<void, DomainError>> {
    try {
      await this.cartRepo.closeCart(sessionId);
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`closeCart failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async transferGuestCart(
    guestSessionId: string,
    targetSessionId: string,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.cartRepo.transferCartToSession(guestSessionId, targetSessionId);
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`transferGuestCart failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }
}
