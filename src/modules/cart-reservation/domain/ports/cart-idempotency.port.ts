/**
 * Puerto de salida de idempotencia para el carrito.
 *
 * Reutiliza la tabla genérica `idempotency_records` (ADR-018) con
 * scope específico para cada operación de carrito.
 */
export interface CartIdempotencyPort {
  /**
   * Busca un registro idempotente existente.
   * Devuelve el response_json almacenado si existe, o null.
   */
  find(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;

  /**
   * Busca un registro con FOR UPDATE para concurrencia segura.
   */
  findForUpdate(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;

  /**
   * Guarda un registro idempotente. Si ya existe (UNIQUE violation),
   * retorna el registro existente para que el caso de uso resuelva
   * replay vs. divergente.
   */
  save(params: SaveIdempotencyRecordParams): Promise<IdempotencyRecord>;
}

/** Registro de idempotencia del carrito. */
export interface IdempotencyRecord {
  readonly id: string;
  readonly scope: string;
  readonly idempotencyKey: string;
  readonly bodyHash: string;
  readonly responseJson: unknown;
}

/** Parámetros para guardar un registro idempotente. */
export interface SaveIdempotencyRecordParams {
  readonly scope: string;
  readonly idempotencyKey: string;
  readonly bodyHash: string;
  readonly responseJson: unknown;
}
