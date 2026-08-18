import { User, CreateUserData, CreateAdminUserData } from '../models/user';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/** Datos para actualizar perfil (solo campos editables). */
export interface ProfileUpdateData {
  readonly displayName?: string;
  readonly phone?: string | null;
}

/**
 * Puerto de salida de repositorio de usuarios del módulo `identity`.
 * Abstrae la persistencia de usuarios. La implementación concreta (Prisma) vive en infrastructure.
 *
 * El puerto nunca incluye credenciales en forma textual: la verificación/serialización
 * de contraseñas vive en `PasswordHasherPort` y los hashes nunca salen por logs/responses.
 *
 * Cada método devuelve `Result<T, DomainError>`: el adapter captura excepciones
 * técnicas en su límite, las registra sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
export interface UserRepositoryPort {
  /** Busca un usuario por email (case-insensitive). */
  findByEmail(email: string): Promise<Result<User | null, DomainError>>;
  /** Busca un usuario por ID. */
  findById(id: string): Promise<Result<User | null, DomainError>>;
  /** Crea un usuario (cliente) y devuelve la entidad persistida. */
  create(data: CreateUserData): Promise<Result<User, DomainError>>;
  /** Crea un admin pendiente de activación con `must_change_password=true`. */
  createAdmin(data: CreateAdminUserData): Promise<Result<User, DomainError>>;
  /** Establece la contraseña (hash) de un usuario y limpia `must_change_password`. */
  updatePassword(userId: string, passwordHash: string): Promise<Result<User, DomainError>>;
  /** Actualiza campos editables de perfil (solo `display_name` y `phone`). */
  updateProfile(userId: string, profileUpdate: ProfileUpdateData): Promise<Result<User, DomainError>>;
}
