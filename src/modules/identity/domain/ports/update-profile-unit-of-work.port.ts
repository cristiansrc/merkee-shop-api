import { UserRepositoryPort } from './user-repository.port';
import { IdempotencyPort } from './idempotency.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Repositorios acotados a la transacción de actualización de perfil (MSF-ID-003).
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `UpdateProfileUnitOfWorkPort.run` y todas las escrituras (actualización de
 * perfil y persistencia de idempotencia) comparten la misma transacción PostgreSQL.
 */
export interface UpdateProfileTransaction {
  readonly userRepo: UserRepositoryPort;
  readonly idempotency: IdempotencyPort;
}

/**
 * Puerto de salida de unidad de trabajo para actualización de perfil
 * (MSF-ID-003).
 *
 * Encapsula la frontera transaccional real: en una única transacción se
 * actualiza el perfil y se persiste el registro de idempotencia. El adapter
 * captura las excepciones técnicas y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP).
 */
export interface UpdateProfileUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción atómica de actualización de perfil.
   */
  run<T>(
    work: (tx: UpdateProfileTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>>;
}
