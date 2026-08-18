/**
 * Entidad de dominio `User` del módulo `identity`.
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP. Representa un usuario
 * registrado (cliente o admin) con sus credenciales hasheadas.
 */
export type UserRole = 'admin' | 'cliente';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly phone: string | null;
  readonly role: UserRole;
  readonly mustChangePassword: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Datos necesarios para crear un usuario (puerto de repositorio). */
export interface CreateUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly phone: string | null;
  readonly role: UserRole;
}

/**
 * Datos necesarios para crear un admin pendiente de activación (provisión).
 * El adapter genera un hash de contraseña placeholder no autenticable y
 * establece `must_change_password=true`; la activación fija la contraseña real.
 */
export interface CreateAdminUserData {
  readonly email: string;
  readonly displayName: string;
  readonly phone: string | null;
}
