import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import {
  StockAdjustmentProductLockPort,
  ProductLockRecord,
} from '../../domain/ports/stock-adjustment-product-lock.port';

@Injectable()
export class PrismaStockAdjustmentProductLockAdapter
  implements StockAdjustmentProductLockPort
{
  constructor(private readonly prisma: PrismaService) {}

  async lockForUpdate(productId: string): Promise<ProductLockRecord | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        stock_on_hand: number;
        stock_reserved: number;
      }>
    >`
      SELECT id, stock_on_hand, stock_reserved
      FROM products
      WHERE id = ${productId} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      stockOnHand: row.stock_on_hand,
      stockReserved: row.stock_reserved,
    };
  }

  async updateStockOnHand(
    productId: string,
    newStockOnHand: number,
  ): Promise<boolean> {
    try {
      await this.prisma.product.update({
        where: { id: productId },
        data: { stockOnHand: newStockOnHand },
      });
      return true;
    } catch {
      return false;
    }
  }
}
