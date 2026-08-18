import { Injectable } from '@nestjs/common';
import {
  InventoryReservationPort,
  ReservationResult,
} from '../../domain/ports/inventory-reservation.port';

/**
 * Adapter de salida de reserva de inventario (infrastructure).
 *
 * Esqueleto vacío: la implementación real (Prisma con lock transaccional)
 * llega en MSF-CART-001. Traducirá excepciones técnicas a `DomainError` en su
 * límite.
 */
@Injectable()
export class InventoryReservationAdapter implements InventoryReservationPort {
  async reserve(_productId: string, _quantity: number): Promise<ReservationResult> {
    throw new Error('InventoryReservationAdapter.reserve no implementado (MSF-CART-001)');
  }

  async release(_reservationId: string): Promise<void> {
    throw new Error('InventoryReservationAdapter.release no implementado (MSF-CART-001)');
  }
}
