/**
 * Puerto de salida de bloqueo transaccional de producto para ajuste de stock (ADR-011).
 *
 * Bloquea el producto con SELECT FOR UPDATE y retorna su estado actual.
 * El caso de uso calcula el nuevo stock y actualiza dentro de la misma transacción.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface ProductLockRecord {
  readonly id: string;
  readonly stockOnHand: number;
  readonly stockReserved: number;
}

export interface StockAdjustmentProductLockPort {
  /**
   * Bloquea un producto con SELECT FOR UPDATE dentro de una transacción.
   * Retorna null si el producto no existe o está soft-deleted.
   */
  lockForUpdate(productId: string): Promise<ProductLockRecord | null>;

  /**
   * Actualiza solo stock_on_hand de un producto (sin tocar stock_reserved).
   * Retorna null si el producto no existe.
   */
  updateStockOnHand(
    productId: string,
    newStockOnHand: number,
  ): Promise<boolean>;
}
