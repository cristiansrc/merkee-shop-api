/**
 * Puerto de salida de idempotencia del módulo `media` (ADR-018).
 *
 * Abstrae la persistencia de registros de idempotencia para mutaciones
 * idempentes de media upload. El alcance es `creador autenticado + clave +
 * cuerpo canónico`. La implementación concreta (Prisma) vive en infrastructure.
 *
 * No almacena secretos, PII ni credenciales.
 */
export interface MediaIdempotencyRecord {
  readonly scope: string;
  readonly key: string;
  readonly bodyHash: string;
  /**
   * Snapshot mínimo persistido en `idempotency_records.response_json`.
   * Nombre canónico alineado con la columna `response_json` del schema
   * Prisma. Nunca PII ni secretos.
   */
  readonly responseJson: unknown;
}

export interface MediaIdempotencyPort {
  /** Busca un registro por alcance y clave. */
  find(scope: string, key: string): Promise<MediaIdempotencyRecord | null>;
  /**
   * Busca un registro por alcance y clave bloqueándolo con `FOR UPDATE`
   * dentro de la transacción (ADR-018). Devuelve `null` si no existe.
   * Solo debe usarse dentro de una transacción interactiva.
   */
  findForUpdate(
    scope: string,
    key: string,
  ): Promise<MediaIdempotencyRecord | null>;
  /**
   * Persiste un registro de idempotencia. Lanza si la clave ya existe
   * (violación de unicidad).
   */
  save(
    scope: string,
    key: string,
    bodyHash: string,
    responseJson: unknown,
  ): Promise<void>;
}
