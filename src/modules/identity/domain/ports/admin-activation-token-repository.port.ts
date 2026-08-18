import {
  AdminActivationToken,
  CreateAdminActivationTokenData,
} from '../models/admin-activation-token';

/**
 * Puerto de salida de repositorio de tokens de activación de admin.
 *
 * Abstrae la persistencia de tokens opacos de un solo uso. Solo se almacena
 * el hash; nunca el token en claro. La implementación concreta (Prisma) vive
 * en infrastructure.
 */
export interface AdminActivationTokenRepositoryPort {
  /** Busca un token por su hash. */
  findByTokenHash(hash: string): Promise<AdminActivationToken | null>;
  /**
   * Busca el token de activación vigente (no usado y no expirado) de un admin.
   * Devuelve `null` si no existe ninguno vigente. Se usa en el replay de
   * idempotencia para reconstruir la respuesta desde el recurso actual en DB.
   */
  findActiveByUserId(userId: string, now: Date): Promise<AdminActivationToken | null>;
  /** Crea un token de activación y devuelve la entidad persistida. */
  create(data: CreateAdminActivationTokenData): Promise<AdminActivationToken>;
  /**
   * Marca como usado el token no usado expirado de un admin (para permitir
   * reemisión sin violar el índice parcial único `WHERE used_at IS NULL`).
   */
  revokeExpiredUnused(userId: string, now: Date): Promise<void>;
  /**
   * Consume atómicamente un token no usado y no expirado (`used_at IS NULL
   * AND expires_at > now()`). Devuelve `true` solo si se consumió; `false`
   * si ya fue usado o expiró. La vigencia se valida en la transacción de
   * canje, no en el índice.
   */
  consumeUnused(tokenId: string, now: Date): Promise<boolean>;
}
