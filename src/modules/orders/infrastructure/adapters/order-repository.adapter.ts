import { Injectable } from '@nestjs/common';
import {
  OrderPage,
  OrderRecord,
  OrderRepositoryPort,
  OrderListItem,
} from '../../domain/ports/order-repository.port';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';

/**
 * Adapter Prisma de repositorio de órdenes (infrastructure).
 *
 * Implementa OrderRepositoryPort usando Prisma ORM contra PostgreSQL.
 * Traduce excepciones técnicas a DomainError en su límite.
 */
@Injectable()
export class OrderRepositoryAdapter implements OrderRepositoryPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findById(orderId: string): Promise<OrderRecord | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) return null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      ownerId: order.userId,
      status: order.status,
      itemsSubtotalCop: order.itemsSubtotalCop,
      deliveryFeeCop: order.deliveryFeeCop,
      ivaCop: order.ivaCop,
      taxRateBasisPoints: order.taxRateBasisPoints,
      totalCop: order.totalCop,
      deliveryRecipientName: order.deliveryRecipientName,
      deliveryLine1: order.deliveryLine1,
      deliveryCity: order.deliveryCity,
      deliveryPhone: order.deliveryPhone,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        unitPriceCop: item.unitPriceCop,
        quantity: item.quantity,
        subtotalCop: item.subtotalCop,
      })),
    };
  }

  async listByOwner(ownerId: string, page: number, size: number): Promise<OrderPage> {
    const skip = (page - 1) * size;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalCop: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({
        where: { userId: ownerId },
      }),
    ]);

    const items: OrderListItem[] = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCop: order.totalCop,
      createdAt: order.createdAt,
    }));

    return {
      items,
      page,
      size,
      total,
    };
  }
}
