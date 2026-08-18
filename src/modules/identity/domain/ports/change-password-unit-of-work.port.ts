import { UserRepositoryPort } from './user-repository.port';
import { SessionRepositoryPort } from './session-repository.port';
import { IdempotencyPort } from './idempotency.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Repositorios acotados a la transacción de cambio de contraseña (MSF-ID-003).
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `ChangePasswordUnitOfWorkPort.run` y todas las escrituras (cambio de
 * `password_hash`, limpieza de `must_change_password`, revocación de las
 * demás sesiones del usuario y rotación del refresh token) comparten la
 * misma transacción PostgreSQL.
 */
export interface ChangePasswordTransaction {
  readonly userRepo: UserRepositoryPort;
  readonly sessionRepo: SessionRepositoryPort;
  readonly idempotency: IdempotencyPort;
}

/**
 * Puerto de salida de unidad de trabajo para cambio de contraseña
 * (MSF-ID-003).
 *
 * Encapsula la frontera transaccional real: en una única transacción se
 * actualiza `password_hash`, se limpia `must_change_password`, se rota la
 * sesión actual (nuevo refresh token hash) y se revocan todas las demás
 * sesiones del usuario. El adapter captura las excepciones técnicas y las
 * traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 */
export interface ChangePasswordUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción atómica de cambio de contraseña.
   * `keepSessionId` es la sesión actual que se conserva y a la que se rota
   * el refresh token; todas las demás sesiones del usuario quedan revocadas.
   */
  run<T>(
    keepSessionId: string,
    work: (tx: ChangePasswordTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>>;
}
