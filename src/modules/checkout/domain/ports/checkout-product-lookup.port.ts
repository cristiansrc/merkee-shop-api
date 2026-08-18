/**
 * Puerto de salida de consulta de productos para checkout.
 *
 * Solo lectura: recupera precios y datos de productos para recálculo
 * desde el servidor (Master Spec AC-08).
 */
export interface CheckoutProductLookupPort {
  /** Busca productos por IDs. Retorna un Map<id, ProductSnapshot>. */
  findByIds(
    ids: readonly string[],
  ): Promise<Map<string, ProductSnapshot>>;
}

/** Snapshot mínimo de producto para checkout. */
export interface ProductSnapshot {
  readonly id: string;
  readonly name: string;
  readonly regularPriceCop: bigint;
  readonly salePriceCop: bigint;
  readonly unit: string;
}
