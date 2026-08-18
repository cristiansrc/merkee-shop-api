import { UserRepositoryPort } from './user-repository.port';
import { SessionRepositoryPort } from './session-repository.port';
import { PasswordResetTokenRepositoryPort } from './password-reset-token-repository.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Repositorios acotados a la transacción de restablecimiento de contraseña.
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `ResetPasswordUnitOfWorkPort.run` y todas las escrituras (consumo del token,
 * cambio de `password_hash`, revocación de todas las sesiones del usuario)
 * comparten la misma transacción PostgreSQL.
 */
export interface ResetPasswordTransaction {
  readonly userRepo: UserRepositoryPort;
  readonly sessionRepo: SessionRepositoryPort;
  readonly passwordResetTokenRepo: PasswordResetTokenRepositoryPort;
}

/**
 * Puerto de salida de unidad de trabajo para restablecimiento de contraseña.
 *
 * Encapsula la frontera transaccional real: en una única transacción se
 * marca el token como usado, se actualiza `password_hash` y se revocan
 * todas las sesiones del usuario. El adapter captura las excepciones técnicas
 * y las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 *
 * El callback `work` puede lanzar un `DomainError` para indicar un error
 * de negocio (ej: token ya usado en carrera). El adapter lo captura y lo
 * propaga como `Failure`.
 */
export interface ResetPasswordUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción atómica de restablecimiento.
   * Todas las sesiones del usuario quedan revocadas (no se conserva ninguna).
   * Si `work` lanza un `DomainError`, el adapter lo captura y devuelve `Failure`.
   */
  run(
    work: (tx: ResetPasswordTransaction) => Promise<Result<void, DomainError>>,
  ): Promise<Result<void, DomainError>>;
}
