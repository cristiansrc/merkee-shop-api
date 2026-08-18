/**
 * Entidad de dominio `Session` del módulo `identity`.
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP. Representa una sesión de
 * servidor (guest o autenticada) con refresh token opaco hashado.
 */
export type SessionKind = 'GUEST' | 'AUTHENTICATED';

export interface Session {
  readonly id: string;
  readonly userId: string | null;
  readonly sessionKind: SessionKind;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/** Datos necesarios para crear una sesión (puerto de repositorio). */
export interface CreateSessionData {
  readonly userId: string | null;
  readonly sessionKind: SessionKind;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
}
