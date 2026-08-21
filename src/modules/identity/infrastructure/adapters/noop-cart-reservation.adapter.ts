import { Injectable } from '@nestjs/common';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import { Result, ok } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Adapter noop de transición de carrito (MSF-ID-001).
 *
 * Implementación vacía hasta que MSF-CART-001 proporcione el adapter
 * real. Las operaciones son no-destructivas: no liberan reservas ni
 * cierran carritos reales. Esto permite que el flujo de login
 * guest→admin compile y funcione sin el módulo cart-reservation.
 *
 * Cuando MSF-CART-001 esté completo, este adapter se reemplazará por
 * una implementación que invoque los puertos reales de cart-reservation.
 *
 * ROP: devuelve `Result<void, DomainError>` alineado al puerto (Master Spec §ROP).
 */
@Injectable()
export class NoopCartReservationAdapter implements CartReservationPort {
  async releaseActiveReservations(_sessionId: string): Promise<Result<void, DomainError>> {
    // Noop: MSF-CART-001 pendiente
    return ok(undefined);
  }

  async closeCart(_sessionId: string): Promise<Result<void, DomainError>> {
    // Noop: MSF-CART-001 pendiente
    return ok(undefined);
  }

  async transferGuestCart(
    _guestSessionId: string,
    _targetSessionId: string,
  ): Promise<Result<void, DomainError>> {
    // Noop: MSF-CART-001 pendiente
    return ok(undefined);
  }
}
