import { Inject, Injectable, Logger } from '@nestjs/common';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';
import { CART_TOKENS } from '../../../cart-reservation/cart-reservation.tokens';
import { CartRepositoryPort } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { StockReservationPort } from '../../../cart-reservation/domain/ports/stock-reservation.port';

/**
 * Adapter real de transición de carrito para el módulo `identity`.
 *
 * Implementa `CartReservationPort` (puerto de identidad) delegando en los
 * puertos de salida de `cart-reservation`:
 * - `releaseActiveReservations` → libera reservas ACTIVE del carrito guest.
 * - `closeCart` → cierra el carrito guest (ACTIVE → CLOSED).
 * - `transferGuestCart` → re-apunta el carrito a la sesión autenticada del
 *   cliente (promoción guest→cliente).
 *
 * Sustituye al `NoopCartReservationAdapter` (MSF-ID-001). Captura excepciones
 * técnicas en su límite y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP), sin PII ni causas.
 */
@Injectable()
export class CartReservationAdapter implements CartReservationPort {
  private readonly logger = new Logger(CartReservationAdapter.name);

  constructor(
    @Inject(CART_TOKENS.CART_REPOSITORY)
    private readonly cartRepo: CartRepositoryPort,
    @Inject(CART_TOKENS.STOCK_RESERVATION)
    private readonly stockReservation: StockReservationPort,
  ) {}

  async releaseActiveReservations(
    sessionId: string,
  ): Promise<Result<void, DomainError>> {
    try {
      const cartWithItems = await this.cartRepo.findCartWithItems(sessionId);
      if (!cartWithItems) {
        return ok(undefined);
      }
      await this.stockReservation.releaseAllForCart(cartWithItems.cart.id);
      return ok(undefined);
    } catch (error) {
      this.logger.warn(
        `releaseActiveReservations failed (code=${(error as { code?: string }).code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }

  async closeCart(sessionId: string): Promise<Result<void, DomainError>> {
    try {
      await this.cartRepo.closeCart(sessionId);
      return ok(undefined);
    } catch (error) {
      this.logger.warn(
        `closeCart failed (code=${(error as { code?: string }).code ?? 'unknown'})`,
      );
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
      this.logger.warn(
        `transferGuestCart failed (code=${(error as { code?: string }).code ?? 'unknown'})`,
      );
      return fail(technicalFailure());
    }
  }
}
