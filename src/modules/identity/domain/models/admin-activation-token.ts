/**
 * Entidad de dominio `AdminActivationToken` del módulo `identity`.
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP. Representa un token de
 * activación de admin opaco, de un solo uso, con expiración de 24 horas.
 * Solo se persiste el hash del token; nunca el token en claro.
 */
export interface AdminActivationToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Datos necesarios para crear un token de activación (puerto de repositorio). */
export interface CreateAdminActivationTokenData {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdByUserId: string;
}
