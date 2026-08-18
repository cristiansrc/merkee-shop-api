import { UserRepositoryPort } from './user-repository.port';
import { SessionRepositoryPort } from './session-repository.port';
import { AdminActivationTokenRepositoryPort } from './admin-activation-token-repository.port';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Repositorios acotados a la transacción de activación de admin.
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `ActivateAdminUnitOfWorkPort.run` y opera sobre ellas; todas las escrituras
 * comparten la misma transacción PostgreSQL.
 */
export interface ActivateAdminTransaction {
  readonly userRepo: UserRepositoryPort;
  readonly sessionRepo: SessionRepositoryPort;
  readonly activationTokenRepo: AdminActivationTokenRepositoryPort;
}

/**
 * Puerto de salida de unidad de trabajo de activación de admin.
 *
 * Encapsula la frontera transaccional real: una única transacción PostgreSQL
 * que consume el token de activación (`used_at IS NULL AND expires_at > now()`),
 * actualiza `password_hash`/`must_change_password` y revoca las demás sesiones
 * del admin de forma atómica, con rollback total ante fallo. La implementación
 * concreta (Prisma) vive en infrastructure; el dominio/aplicación no conocen
 * Prisma.
 */
export interface ActivateAdminUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción de activación. Si el callback lanza,
   * la transacción se revierte íntegramente (rollback total).
   */
  run<T>(
    work: (tx: ActivateAdminTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>>;
}
