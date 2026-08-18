import { Injectable } from '@nestjs/common';
import { CheckoutProductLookupPort, ProductSnapshot } from '../../domain/ports/checkout-product-lookup.port';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';

/**
 * Adapter Prisma de consulta de productos para checkout (infrastructure).
 *
 * Implementa CheckoutProductLookupPort usando Prisma ORM contra PostgreSQL.
 * Solo lectura: recupera precios y datos de productos para recálculo
 * desde el servidor (Master Spec AC-08).
 */
@Injectable()
export class CheckoutProductLookupAdapter implements CheckoutProductLookupPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findByIds(ids: readonly string[]): Promise<Map<string, ProductSnapshot>> {
    if (ids.length === 0) {
      return new Map();
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...ids] },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        regularPriceCop: true,
        salePriceCop: true,
        unit: true,
      },
    });

    const map = new Map<string, ProductSnapshot>();
    for (const product of products) {
      map.set(product.id, {
        id: product.id,
        name: product.name,
        regularPriceCop: product.regularPriceCop,
        salePriceCop: product.salePriceCop,
        unit: product.unit,
      });
    }

    return map;
  }
}
