/**
 * Puerto de salida de repositorio de tokens de restablecimiento de contraseña.
 *
 * Abstrae la persistencia de tokens de reset. La implementación concreta (Prisma)
 * vive en infrastructure. Los tokens se almacenan SOLO con hash (nunca en claro).
 */
export interface PasswordResetTokenRepositoryPort {
  /**
   * Invalida (marca como usados) todos los tokens no usados de un usuario.
   * Idempotente: si no hay tokens activos, no falla.
   */
  invalidateAllActiveForUser(userId: string): Promise<void>;

  /**
   * Crea un nuevo token de reset para el usuario indicado.
   * @param userId ID del usuario
   * @param tokenHash Hash SHA-256 del token opaco
   * @param expiresAt Fecha de expiración (30 minutos desde ahora)
   */
  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Busca un token por su hash.
   * @returns El token encontrado o null si no existe.
   */
  findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null>;

  /**
   * Marca un token como usado (consumo atómico).
   * Verifica condicionalmente que `usedAt IS NULL AND expiresAt > now`
   * dentro de la misma operación para evitar TOCTOU.
   * @param tokenId ID del token a consumir
   * @param now Instante actual (provisto por ClockPort del use case)
   * @returns true si se marcó exitosamente, false si ya estaba usado o expirado
   */
  markAsUsed(tokenId: string, now: Date): Promise<boolean>;
}

/** Registro de token de reset (sin el token en claro). */
export interface PasswordResetTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}
