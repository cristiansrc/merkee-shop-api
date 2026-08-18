import { Injectable } from '@nestjs/common';
import { CartTransitionGuestToAdminPort } from '../../domain/ports/cart-transition-guest-to-admin.port';
import { CartRepositoryPort } from '../../domain/ports/cart-repository.port';
import { StockReservationPort } from '../../domain/ports/stock-reservation.port';
import { TransitionGuestToAdminUseCase } from '../../application/use-cases/transition-guest-to-admin.use-case';

/**
 * Adapter de transición guest→admin (infrastructure).
 *
 * Implementa CartTransitionGuestToAdminPort del módulo cart-reservation
 * y se expone al módulo identity como sustituto del NoopCartReservationAdapter.
 *
 * ADR-014: admin no es comprador; la promoción guest→admin es
 * destructiva para ACTIVE y conserva CHECKOUT_PENDING.
 */
@Injectable()
export class CartTransitionGuestToAdminAdapter
  implements CartTransitionGuestToAdminPort
{
  private readonly useCase: TransitionGuestToAdminUseCase;

  constructor(
    private readonly cartRepo: CartRepositoryPort,
    private readonly stockReservation: StockReservationPort,
  ) {
    this.useCase = new TransitionGuestToAdminUseCase(
      cartRepo,
      stockReservation,
    );
  }

  async releaseAndClose(guestSessionId: string): Promise<void> {
    const result = await this.useCase.execute(guestSessionId);
    if (!result.ok) {
      // Propagar error técnico desde el caso de uso
      throw new Error(result.error.code);
    }
  }
}
