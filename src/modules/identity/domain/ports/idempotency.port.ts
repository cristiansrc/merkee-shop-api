/**
 * Puerto de salida de idempotencia del módulo `identity`.
 *
 * Abstrae la persistencia de registros de idempotencia para mutaciones
 * idempotentes (provisión de admin). El alcance es `creador autenticado +
 * clave + cuerpo canónico`. La implementación concreta (Prisma) vive en
 * infrastructure.
 */
export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: string;
  readonly bodyHash: string;
  /**
   * Snapshot persistido en `idempotency_records.response_json` (canonical).
   * Nombre canónico alineado con la columna `response_json` del schema
   * Prisma y la migración 009 (rename). Nunca PII ni secretos.
   */
  readonly responseJson: unknown;
}

export interface IdempotencyPort {
  /** Busca un registro por alcance y clave. */
  find(scope: string, key: string): Promise<IdempotencyRecord | null>;
  /**
   * Busca un registro por alcance y clave bloqueándolo con `FOR UPDATE`
   * dentro de la transacción de provisión (ADR-018). Devuelve `null` si no
   * existe. Solo debe usarse dentro de una transacción interactiva.
   */
  findForUpdate(scope: string, key: string): Promise<IdempotencyRecord | null>;
  /**
   * Persiste un registro de idempotencia. Lanza si la clave ya existe.
   * El cuarto argumento es la instantánea (`responseJson`) que se guarda en
   * la columna canónica `response_json`.
   */
  save(
    scope: string,
    key: string,
    bodyHash: string,
    responseJson: unknown,
  ): Promise<void>;
}
