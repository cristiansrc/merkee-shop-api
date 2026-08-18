/**
 * Puerto de entrada de verificación de actor del catálogo.
 *
 * El controller extrae el actor del request; el caso de uso verifica
 * que sea admin con must_change_password=false.
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

export interface ActorInfo {
  readonly id: string;
  readonly role: string;
  readonly mustChangePassword: boolean;
}

export interface ActorLookupPort {
  /** Busca info del actor por id. Retorna null si no existe. */
  findById(actorId: string): Promise<ActorInfo | null>;
}
