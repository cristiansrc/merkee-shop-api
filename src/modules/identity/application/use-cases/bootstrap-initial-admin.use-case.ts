import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { InitialAdminSecretPort } from '../../domain/ports/initial-admin-secret.port';
import { BootstrapUnitOfWorkPort } from '../../domain/ports/bootstrap-unit-of-work.port';
import { technicalFailure } from '../../domain/identity-errors';

/** Email canónico del único admin inicial (ADR-010). */
export const INITIAL_ADMIN_EMAIL = 'cristiansrc@gmail.com';
/** Nombre visible del admin inicial. No contiene PII sensible. */
export const INITIAL_ADMIN_DISPLAY_NAME = 'Admin';

/** Resultado de éxito del bootstrap del admin inicial. */
export interface BootstrapInitialAdminResult {
  /** `created` si se creó el admin; `noop` si ya existía (no se tocó nada). */
  readonly outcome: 'created' | 'noop';
}

/** Resultado interno del callback transaccional. */
type BootstrapOutcome =
  | { readonly kind: 'created' }
  | { readonly kind: 'noop' }
  | { readonly kind: 'roleMismatch' };

/**
 * Caso de uso de bootstrap seguro e idempotente del admin inicial (ADR-010).
 *
 * Crea/valida únicamente `cristiansrc@gmail.com` como `admin` con
 * `must_change_password=true`. La contraseña inicial llega SOLO por referencia
 * externa (variable de entorno/Secrets Manager) a través de
 * `InitialAdminSecretPort`; nunca se hardcodea. Si el secreto falta, falla de
 * forma segura ANTES de crear usuario. La validación (relectura con lock) y el
 * resultado no-op se resuelven DENTRO de la misma transacción atómica vía
 * `BootstrapUnitOfWorkPort`: si el correo canónico ya existe con `role=admin`
 * es un **no-op** (no reescribe contraseña, hash ni flag); si existe con otro
 * rol, falla de forma segura sin modificar nada (ADR-010). Solo cuando no
 * existe se hashea la contraseña con Argon2id y se crea el admin. Nunca
 * registra contraseña, hash, secreto ni PII innecesaria.
 *
 * Capa `application` pura: sin NestJS/Prisma/HTTP y sin captura de excepciones
 * técnicas. La traducción de fallos técnicos a `TECHNICAL_DEPENDENCY_FAILURE`
 * ocurre en el límite del adapter de infraestructura (Master Spec §ROP), que
 * devuelve `Result`; la aplicación solo conserva reglas de negocio y devuelve
 * `Result`.
 */
export class BootstrapInitialAdminUseCase {
  constructor(
    private readonly passwordHasher: PasswordHasherPort,
    private readonly initialAdminSecret: InitialAdminSecretPort,
    private readonly unitOfWork: BootstrapUnitOfWorkPort,
  ) {}

  async execute(): Promise<Result<BootstrapInitialAdminResult, DomainError>> {
    // 1. Secreto externo: si falta, falla de forma segura antes de crear
    //    usuario. Nunca se registra el valor.
    const secret = this.initialAdminSecret.getInitialAdminPassword();
    if (!secret) {
      return fail(technicalFailure());
    }

    // 2. Transacción atómica: valida (relee con lock) y crea el admin con
    //    Argon2id y must_change_password=true. Rollback total ante fallo.
    //    No hay no-op definitivo fuera de la transacción: la decisión de
    //    crear/no-op/fallar se toma dentro de la misma unidad transaccional
    //    para evitar carreras entre nodos que dupliquen el admin. El adapter
    //    captura y traduce los fallos técnicos a `Result` (Master Spec §ROP);
    //    la aplicación nunca captura excepciones técnicas.
    const outcomeResult = await this.unitOfWork.run<BootstrapOutcome>(
      async (tx) => {
        const currentResult = await tx.userRepo.findByEmail(INITIAL_ADMIN_EMAIL);
        if (isFailure(currentResult)) {
          return { kind: 'roleMismatch' };
        }
        const current = currentResult.value;
        if (current) {
          // No-op solo si el correo canónico ya es admin; otro rol falla
          // seguro sin reescribir credenciales ni flag.
          if (current.role !== 'admin') {
            return { kind: 'roleMismatch' };
          }
          return { kind: 'noop' };
        }
        // Solo se hashea cuando realmente se va a crear el admin.
        const hashResult = await this.passwordHasher.hash(secret);
        if (isFailure(hashResult)) {
          return { kind: 'roleMismatch' };
        }
        const createResult = await tx.userRepo.create({
          email: INITIAL_ADMIN_EMAIL,
          passwordHash: hashResult.value,
          displayName: INITIAL_ADMIN_DISPLAY_NAME,
          phone: null,
          role: 'admin',
        });
        if (isFailure(createResult)) {
          return { kind: 'roleMismatch' };
        }
        return { kind: 'created' };
      },
    );

    // Fallo técnico traducido por el adapter: se propaga tal cual (sin causa,
    // mensaje ni PII).
    if (isFailure(outcomeResult)) {
      return outcomeResult;
    }

    const outcome = outcomeResult.value;
    if (outcome.kind === 'roleMismatch') {
      return fail(technicalFailure());
    }
    return ok({ outcome: outcome.kind });
  }
}