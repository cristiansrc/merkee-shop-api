/**
 * Alcances de idempotencia del módulo `identity` (ADR-018).
 *
 * El `scope` identifica la operación idempotente y su actor. Para la provisión
 * de admin es `admin-provision:{actorId}`. El evaluador de estado de purga usa
 * este prefijo para saber que la operación asociada es terminal al confirmar la
 * transacción de provisión (el canje posterior del token es un flujo separado y
 * no prolonga el replay).
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP.
 */

/** Prefijo de scope de provisión de admin. */
export const ADMIN_PROVISION_SCOPE_PREFIX = 'admin-provision:';

/** Construye el scope de idempotencia de provisión para un actor. */
export function adminProvisionScope(actorId: string): string {
  return `${ADMIN_PROVISION_SCOPE_PREFIX}${actorId}`;
}
