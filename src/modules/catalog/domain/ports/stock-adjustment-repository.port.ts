/**
 * Puerto de salida de repositorio de ajustes de stock (ADR-011).
 *
 * Append-only: solo inserta registros de auditoría inmutable.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface StockAdjustmentRecord {
  readonly id: string;
  readonly productId: string;
  readonly adminUserId: string;
  readonly quantityDelta: number;
  readonly reason: string;
  readonly stockOnHandBefore: number;
  readonly stockOnHandAfter: number;
  readonly stockReserved: number;
  readonly stockAvailable: number;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export interface StockAdjustmentRepositoryPort {
  /** Inserta un registro de ajuste de stock (append-only). */
  insert(record: {
    readonly productId: string;
    readonly adminUserId: string;
    readonly quantityDelta: number;
    readonly reason: string;
    readonly stockOnHandBefore: number;
    readonly stockOnHandAfter: number;
    readonly stockReserved: number;
    readonly stockAvailable: number;
    readonly idempotencyKey: string;
  }): Promise<StockAdjustmentRecord>;
}
