import { UserRole } from '../models/user';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/** Payload del JWT de acceso (nunca incluye secretos ni PII). */
export interface JwtPayload {
  /** ID del usuario (subject). */
  readonly sub: string;
  /** ID de la sesión. */
  readonly session_id: string;
  /** Rol del usuario. */
  readonly role: UserRole;
}

/**
 * Puerto de salida de JWT del módulo `identity`.
 *
 * Abstrae la firma y verificación de tokens de acceso. La implementación
 * concreta (jsonwebtoken) vive en infrastructure.
 *
 * Cada método devuelve `Result<T, DomainError>`: el adapter captura excepciones
 * técnicas en su límite, las registra sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
export interface JwtPort {
  /** Firma un payload y devuelve el token JWT o un error técnico. */
  sign(payload: JwtPayload): Promise<Result<string, DomainError>>;
  /** Verifica un token JWT y devuelve el payload o un error del catálogo. */
  verify(token: string): Promise<Result<JwtPayload, DomainError>>;
}
