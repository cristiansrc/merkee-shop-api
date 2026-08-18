import { UserRepositoryPort } from './user-repository.port';
import { PasswordResetTokenRepositoryPort } from './password-reset-token-repository.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Repositorios acotados a la transacción de solicitud de restablecimiento.
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `RequestPasswordResetUnitOfWorkPort.run` y todas las escrituras
 * (invalidación de tokens anteriores, creación del nuevo token)
 * comparten la misma transacción PostgreSQL.
 */
export interface RequestPasswordResetTransaction {
  readonly userRepo: UserRepositoryPort;
  readonly passwordResetTokenRepo: PasswordResetTokenRepositoryPort;
}

/**
 * Puerto de salida de unidad de trabajo para solicitud de restablecimiento
 * de contraseña (MSF-ID-003).
 *
 * Encapsula la frontera transaccional real: en una única transacción se
 * invalidan tokens activos anteriores del usuario y se crea el nuevo
 * token hash. El adapter captura las excepciones técnicas y las traduce
 * a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 *
 * Garantiza que máximo un token activo existe por usuario (índice parcial
 * único `WHERE used_at IS NULL` en la migración 014).
 */
export interface RequestPasswordResetUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción atómica de solicitud de reset.
   * Si `work` lanza un `DomainError`, el adapter lo captura y devuelve
   * `Failure`.
   */
  run(
    work: (tx: RequestPasswordResetTransaction) => Promise<void>,
  ): Promise<Result<void, DomainError>>;
}
