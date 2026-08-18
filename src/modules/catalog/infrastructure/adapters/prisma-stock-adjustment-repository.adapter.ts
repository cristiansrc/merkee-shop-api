import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import {
  StockAdjustmentRepositoryPort,
  StockAdjustmentRecord,
} from '../../domain/ports/stock-adjustment-repository.port';

@Injectable()
export class PrismaStockAdjustmentRepositoryAdapter
  implements StockAdjustmentRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async insert(record: {
    readonly productId: string;
    readonly adminUserId: string;
    readonly quantityDelta: number;
    readonly reason: string;
    readonly stockOnHandBefore: number;
    readonly stockOnHandAfter: number;
    readonly stockReserved: number;
    readonly stockAvailable: number;
    readonly idempotencyKey: string;
  }): Promise<StockAdjustmentRecord> {
    const row = await this.prisma.productStockAdjustment.create({
      data: {
        productId: record.productId,
        adminUserId: record.adminUserId,
        quantityDelta: record.quantityDelta,
        reason: record.reason,
        stockOnHandBefore: record.stockOnHandBefore,
        stockOnHandAfter: record.stockOnHandAfter,
        stockReserved: record.stockReserved,
        stockAvailable: record.stockAvailable,
        idempotencyKey: record.idempotencyKey,
      },
    });
    return {
      id: row.id,
      productId: row.productId,
      adminUserId: row.adminUserId,
      quantityDelta: row.quantityDelta,
      reason: row.reason,
      stockOnHandBefore: row.stockOnHandBefore,
      stockOnHandAfter: row.stockOnHandAfter,
      stockReserved: row.stockReserved,
      stockAvailable: row.stockAvailable,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
    };
  }
}
