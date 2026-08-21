import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import { ProductLookupPort } from '../../domain/ports/product-lookup.port';
import { CartProduct } from '../../domain/models';

/**
 * Adapter Prisma de consulta de producto para el carrito (infrastructure).
 * Solo lectura: no modifica stock ni reserva.
 */
@Injectable()
export class PrismaProductLookupAdapter implements ProductLookupPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findActiveForCart(productId: string): Promise<CartProduct | null> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: true,
      },
    });

    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      regularPriceCop: product.regularPriceCop,
      salePriceCop: product.salePriceCop,
      unit: product.unit,
      stockOnHand: product.stockOnHand,
      stockReserved: product.stockReserved,
      images: product.images.map((img) => ({
        key: img.key,
        altText: img.altText,
        position: img.position,
      })),
      category: {
        id: product.category.id,
        name: product.category.name,
        imageKey: product.category.imageKey,
      },
    };
  }

  async findActiveForCartByIds(productIds: readonly string[]): Promise<Map<string, CartProduct>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...productIds] },
        deletedAt: null,
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: true,
      },
    });

    const result = new Map<string, CartProduct>();
    for (const product of products) {
      result.set(product.id, {
        id: product.id,
        name: product.name,
        regularPriceCop: product.regularPriceCop,
        salePriceCop: product.salePriceCop,
        unit: product.unit,
        stockOnHand: product.stockOnHand,
        stockReserved: product.stockReserved,
        images: product.images.map((img) => ({
          key: img.key,
          altText: img.altText,
          position: img.position,
        })),
        category: {
          id: product.category.id,
          name: product.category.name,
          imageKey: product.category.imageKey,
        },
      });
    }

    return result;
  }
}
