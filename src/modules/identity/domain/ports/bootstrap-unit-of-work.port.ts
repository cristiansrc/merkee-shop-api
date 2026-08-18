import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from './user-repository.port';

/**
 * Repositorios acotados a la transacción de bootstrap del admin inicial.
 *
 * El caso de uso recibe estas instancias dentro del callback de
 * `BootstrapUnitOfWorkPort.run` y opera sobre ellas; todas las escrituras
 * comparten la misma transacción PostgreSQL.
 */
export interface BootstrapTransaction {
  readonly userRepo: UserRepositoryPort;
}

/**
 * Puerto de salida de unidad de trabajo de bootstrap del admin inicial.
 *
 * Encapsula la frontera transaccional real: una única transacción PostgreSQL
 * que valida (relee) y crea el admin inicial de forma atómica, con rollback
 * total ante fallo. La implementación concreta (Prisma) vive en infrastructure;
 * el dominio/aplicación no conocen Prisma.
 *
 * ADR-010: la creación/validación del admin inicial es atómica para evitar
 * carreras entre nodos que dupliquen el admin o dejen estado parcial.
 *
 * Devuelve `Result<T, DomainError>`: el adapter de infraestructura captura
 * las excepciones técnicas en su límite, las registra sin PII y las traduce
 * a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP). La aplicación nunca
 * captura excepciones técnicas: solo recibe el rail `Failure`.
 */
export interface BootstrapUnitOfWorkPort {
  /**
   * Ejecuta `work` dentro de la transacción de bootstrap. Si el callback lanza,
   * la transacción se revierte íntegramente y el adapter traduce el fallo
   * técnico a `Result` sin propagar la causa/PII.
   */
  run<T>(
    work: (tx: BootstrapTransaction) => Promise<T>,
  ): Promise<Result<T, DomainError>>;
}
