import { Injectable } from '@nestjs/common';
import {
  AdminOrderPage,
  OrderQueryPort,
} from '../../domain/ports/order-query.port';

/**
 * Adapter de salida de consulta read-only de órdenes (infrastructure).
 *
 * Esqueleto vacío: la implementación real (Prisma, solo lectura) llega en
 * MSF-ADMIN-003. Traducirá errores técnicos a `DomainError` en su límite.
 */
@Injectable()
export class OrderQueryAdapter implements OrderQueryPort {
  async listOrders(_page: number, _size: number): Promise<AdminOrderPage> {
    throw new Error('OrderQueryAdapter.listOrders no implementado (MSF-ADMIN-003)');
  }
}
