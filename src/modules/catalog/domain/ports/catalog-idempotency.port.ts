/**
 * Puerto de salida de idempotencia del catálogo (ADR-018).
 *
 * Reutiliza la tabla `idempotency_records` con scopes específicos de catálogo.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface IdempotencyRecord {
  readonly scope: string;
  readonly idempotencyKey: string;
  readonly bodyHash: string;
  readonly responseJson: unknown;
}

export interface CatalogIdempotencyPort {
  /** Busca un registro idempotente por scope y key. */
  find(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;

  /** Busca con FOR UPDATE (bloqueo pesimista). */
  findForUpdate(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;

  /** Guarda un registro idempotente. Lanza si unique constraint. */
  save(record: {
    readonly scope: string;
    readonly idempotencyKey: string;
    readonly bodyHash: string;
    readonly responseJson: unknown;
  }): Promise<void>;
}
