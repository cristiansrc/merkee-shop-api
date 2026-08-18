import { Injectable, Inject } from '@nestjs/common';
import { CheckoutReservationPort } from '../../domain/ports/checkout-reservation.port';
import { StockReservationPort } from '../../../cart-reservation/domain/ports/stock-reservation.port';
import { CartRepositoryPort } from '../../../cart-reservation/domain/ports/cart-repository.port';
import { CART_TOKENS } from '../../../cart-reservation/cart-reservation.tokens';

/**
 * Adapter de salida de checkout hacia `cart-reservation` (infrastructure).
 *
 * Implementa la conversión de reservas ACTIVE → CHECKOUT_PENDING usando
 * los puertos de `cart-reservation` (dependencia directa checkout →
 * cart-reservation, ADR-013). Traducirá errores técnicos a `DomainError`
 * en su límite.
 */
@Injectable()
export class CheckoutReservationAdapter implements CheckoutReservationPort {
  constructor(
    @Inject(CART_TOKENS.STOCK_RESERVATION)
    private readonly stockReservation: StockReservationPort,
    @Inject(CART_TOKENS.CART_REPOSITORY)
    private readonly cartRepo: CartRepositoryPort,
  ) {}

  async convertActiveToCheckoutPending(cartId: string): Promise<void> {
    try {
      // Obtener todas las reservas ACTIVE del carrito
      const cartWithItems = await this.cartRepo.findCartWithItemsByCartId(cartId);
      if (!cartWithItems) {
        throw new Error('CART_NOT_FOUND');
      }

      // Convertir cada reserva ACTIVE a CHECKOUT_PENDING
      for (const item of cartWithItems.items) {
        if (item.reservation && item.reservation.status === 'ACTIVE') {
          // Usar el stockReservation para actualizar el estado
          // Esto se hace dentro de la transacción del UoW
          await this.stockReservation.convertToCheckoutPending(item.reservation.id);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'CART_NOT_FOUND') {
        throw error;
      }
      // Error técnico no clasificable
      throw new Error('TECHNICAL_DEPENDENCY_FAILURE');
    }
  }
}
