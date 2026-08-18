import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de salida de hash de contraseñas del módulo `identity`.
 *
 * Abstrae el algoritmo de hasheado. La implementación concreta (Argon2id)
 * vive en infrastructure.
 *
 * Cada método devuelve `Result<T, DomainError>`: el adapter captura excepciones
 * técnicas en su límite, las registra sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
export interface PasswordHasherPort {
  /** Genera un hash seguro de una contraseña. */
  hash(password: string): Promise<Result<string, DomainError>>;
  /** Verifica que una contraseña coincide con su hash. */
  verify(password: string, hash: string): Promise<Result<boolean, DomainError>>;
}
