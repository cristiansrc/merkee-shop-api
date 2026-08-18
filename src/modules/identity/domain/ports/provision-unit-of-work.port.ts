import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from './user-repository.port';
import { AdminActivationTokenRepositoryPort } from './admin-activation-token-repository.port';
import { IdempotencyPort } from './idempotency.port';

/**
 * Repositorios acotados a una transacción de provisión.
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `ProvisionUnitOfWorkPort.run` y opera sobre ellas; todas las escrituras
 * comparten la misma transacción PostgreSQL.
 */
export interface ProvisionTransaction {
  /** Alcance (scope) que el caller ya conoce al invocar `run(scope, key, work)`. */
  readonly scope?: string;
  /** Clave de idempotencia que el caller ya conoce al invocar `run`. */
  readonly idempotencyKey?: string;
  readonly userRepo: UserRepositoryPort;
  readonly activationTokenRepo: AdminActivationTokenRepositoryPort;
  readonly idempotencyRepo: IdempotencyPort;
}

/**
 * Puerto de salida de unidad de trabajo de provisión de admin (ADR-018).
 *
 * Encapsula la frontera transaccional real: una única transacción PostgreSQL
 * `SERIALIZABLE` que crea usuario admin, token de activación e
 * `idempotency_records` de forma atómica, con advisory lock transaccional
 * derivado de `SHA-256(scope || 0x00 || idempotency_key)`, `FOR UPDATE` de
 * filas aplicables, rollback total ante fallo y hasta tres reintentos de
 * serialización (50/100/200 ms). La implementación concreta (Prisma) vive en
 * infrastructure; el dominio/aplicación no conocen Prisma.
 */
export interface ProvisionUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción de provisión. Si la transacción
   * aborta por serialización o por conflicto de unicidad, se reintenta el
   * callback completo (el advisory lock + `FOR UPDATE` hacen que el reintento
   * encuentre el registro existente y resuelva replay/409).
   *
   * Devuelve `Result<T, DomainError>`: el adapter de infraestructura captura
   * las excepciones técnicas en su límite, las registra sin PII y las traduce
   * a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP). La aplicación nunca
   * captura excepciones técnicas: solo recibe el rail `Failure`.
   */
  run<T>(
    scope: string,
    idempotencyKey: string,
    work: (tx: ProvisionTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>>;
}
