import { createHash } from 'crypto';
import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ClockPort } from '../../domain/ports/clock.port';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { ProvisionUnitOfWorkPort } from '../../domain/ports/provision-unit-of-work.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import {
  actorNotAuthorized,
  authenticationRequired,
  emailAlreadyRegistered,
  idempotencyKeyReused,
  initialPasswordChangeRequired,
  provisionedResourceNotFound,
  technicalFailure,
} from '../../domain/identity-errors';
import type { AdminUserProvisionDto } from '../../../../contract/application/dto';

/** Comando de entrada del caso de uso de provisión de admin. */
export interface ProvisionAdminUserCommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly displayName: string;
  readonly email: string;
  readonly phone: string | null;
}

interface ProvisionAdminUserUseCasePorts {
  readonly userRepo: UserRepositoryPort;
  readonly clock: ClockPort;
  readonly provisionUnitOfWork: ProvisionUnitOfWorkPort;
  readonly cookieToken: CookieTokenPort;
  readonly activationTokenTtlMs?: number;
}

/**
 * SHA-256 del cuerpo canónico del comando de provisión.
 * Canonical: { display_name, email (normalizado), phone }.
 */
function computeBodyHash(command: ProvisionAdminUserCommand): string {
  const canonical = JSON.stringify({
    display_name: command.displayName,
    email: command.email.toLowerCase().trim(),
    phone: command.phone ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Snapshot mínimo persistido en `idempotency_records.response_json`.
 * Cuatro claves canónicas sin PII ni secretos (OpenAPI AdminUserProvisionResponse
 * sin token ni password).
 */
export interface ProvisionResponseSnapshot {
  readonly resource_id: string;
  readonly status: number;
  readonly activation_expires_at: string;
  readonly body_hash: string;
}

/**
 * Resultado interno del callback transaccional de provisión.
 * El caso de uso proyecta esto a `AdminUserProvisionDto` alineado con OpenAPI.
 */
type ProvisionOutcome =
  | { kind: 'unauthorized' }
  | { kind: 'initialPasswordChangeRequired' }
  | { kind: 'emailAlreadyRegistered' }
  | { kind: 'idempotencyConflict' }
  | { kind: 'resourceNotFound' }
  | { kind: 'technicalFailure' }
  | { kind: 'replay'; user: { id: string; displayName: string; email: string; role: string; mustChangePassword: boolean; phone: string | null }; snapshot: ProvisionResponseSnapshot }
  | { kind: 'created'; user: { id: string; displayName: string; email: string; role: string; mustChangePassword: boolean; phone: string | null } };

/**
 * Caso de uso de provisión de admin (MSF-ID-002).
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class ProvisionAdminUserUseCase {
  constructor(private readonly ports: ProvisionAdminUserUseCasePorts) {}

  async execute(
    command: ProvisionAdminUserCommand,
  ): Promise<Result<AdminUserProvisionDto, DomainError>> {
    if (!command.actorId) {
      return fail(authenticationRequired());
    }
    const now = this.ports.clock.now();
    const ttl = this.ports.activationTokenTtlMs ?? 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ttl);
    const bodyHash = computeBodyHash(command);

    // 1. Verificar actor fuera de la transacción
    const actorResult = await this.ports.userRepo.findById(command.actorId);
    if (isFailure(actorResult)) return actorResult;
    const actor = actorResult.value;
    if (!actor) {
      return fail(authenticationRequired());
    }
    if (actor.role !== 'admin') {
      return fail(actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(initialPasswordChangeRequired());
    }

    // 2. Verificar email fuera de la transacción
    const emailResult = await this.ports.userRepo.findByEmail(
      command.email.toLowerCase().trim(),
    );
    if (isFailure(emailResult)) return emailResult;
    if (emailResult.value) {
      return fail(emailAlreadyRegistered());
    }

    // 3. Unidad transaccional con idempotencia (SERIALIZABLE + advisory lock)
    const scope = `admin-provision:${command.actorId}`;
    const uow = await this.ports.provisionUnitOfWork.run(
      scope,
      command.idempotencyKey,
      async (tx) => {
        // Re-verificar actor dentro de la transacción
        const actorTxResult = await tx.userRepo.findById(command.actorId);
        if (isFailure(actorTxResult)) {
          return { kind: 'technicalFailure' as const } as ProvisionOutcome;
        }
        const actorTx = actorTxResult.value;
        if (!actorTx || actorTx.role !== 'admin') {
          return { kind: 'unauthorized' as const } as ProvisionOutcome;
        }
        if (actorTx.mustChangePassword) {
          return { kind: 'initialPasswordChangeRequired' as const } as ProvisionOutcome;
        }

        // Verificar email dentro de la transacción (concurrente)
        const emailTxResult = await tx.userRepo.findByEmail(
          command.email.toLowerCase().trim(),
        );
        if (isFailure(emailTxResult)) {
          return { kind: 'technicalFailure' as const } as ProvisionOutcome;
        }
        if (emailTxResult.value) {
          return { kind: 'emailAlreadyRegistered' as const } as ProvisionOutcome;
        }

        // Verificar idempotencia con FOR UPDATE
        const existing = await tx.idempotencyRepo.findForUpdate(
          scope,
          command.idempotencyKey,
        );
        if (existing) {
          // Replay divergente: body_hash de la columna no coincide con el computado
          if (existing.bodyHash !== bodyHash) {
            return { kind: 'idempotencyConflict' as const } as ProvisionOutcome;
          }
          // Replay: reconstruir desde el recurso vigente en DB
          const snap = existing.responseJson as ProvisionResponseSnapshot | undefined;
          if (snap && typeof snap.resource_id === 'string') {
            // Verificar consistencia del body_hash dentro del snapshot
            if (snap.body_hash !== bodyHash) {
              return { kind: 'idempotencyConflict' as const } as ProvisionOutcome;
            }
            const reloadedResult = await tx.userRepo.findById(snap.resource_id);
            if (isFailure(reloadedResult)) {
              return { kind: 'technicalFailure' as const } as ProvisionOutcome;
            }
            const reloaded = reloadedResult.value;
            if (reloaded) {
              return { kind: 'replay' as const, user: reloaded, snapshot: snap } as ProvisionOutcome;
            }
            // Recurso eliminado tras la provisión original
            return { kind: 'resourceNotFound' as const } as ProvisionOutcome;
          }
          // Snapshot corrupto o con forma inesperada
          return { kind: 'idempotencyConflict' as const } as ProvisionOutcome;
        }

        // Crear admin pendiente de activación
        const createdResult = await tx.userRepo.createAdmin({
          email: command.email.toLowerCase().trim(),
          displayName: command.displayName.trim(),
          phone: command.phone?.trim() || null,
        });
        if (isFailure(createdResult)) {
          return { kind: 'technicalFailure' as const } as ProvisionOutcome;
        }
        const created = createdResult.value;

        // Revocar tokens de activación expirados no usados del nuevo admin
        await tx.activationTokenRepo.revokeExpiredUnused(created.id, now);

        // Token real: generar opaco y hashear (nunca se almacena en claro)
        const rawToken = this.ports.cookieToken.generate();
        const tokenHash = this.ports.cookieToken.hash(rawToken);
        await tx.activationTokenRepo.create({
          userId: created.id,
          tokenHash,
          expiresAt,
          createdByUserId: command.actorId,
        });

        // Persistir snapshot mínimo sin PII en idempotency_records
        const snapshot: ProvisionResponseSnapshot = {
          resource_id: created.id,
          status: 201,
          activation_expires_at: expiresAt.toISOString(),
          body_hash: bodyHash,
        };
        await tx.idempotencyRepo.save(
          scope,
          command.idempotencyKey,
          bodyHash,
          snapshot,
        );

        return { kind: 'created' as const, user: created } as ProvisionOutcome;
      },
    );

    if (isFailure(uow)) {
      return fail(uow.error);
    }
    const outcome = uow.value;

    switch (outcome.kind) {
      case 'unauthorized':
        return fail(actorNotAuthorized());
      case 'initialPasswordChangeRequired':
        return fail(initialPasswordChangeRequired());
      case 'emailAlreadyRegistered':
        return fail(emailAlreadyRegistered());
      case 'resourceNotFound':
        return fail(provisionedResourceNotFound());
      case 'idempotencyConflict':
        return fail(idempotencyKeyReused());
      case 'technicalFailure':
        return fail(technicalFailure());
    }

    // Reconstruir DTO contractual desde la entidad de usuario (replay o created)
    const user = outcome.user;
    if (!user) {
      return fail(technicalFailure());
    }

    // Para replay, preservar activation_expires_at del snapshot original
    let activationExpiresAt = expiresAt.toISOString();
    if (outcome.kind === 'replay' && outcome.snapshot) {
      activationExpiresAt = outcome.snapshot.activation_expires_at;
    }

    return ok({
      id: user.id,
      display_name: user.displayName,
      email: user.email,
      role: user.role as 'admin',
      must_change_password: true as const,
      phone: user.phone,
      activation_expires_at: activationExpiresAt,
    });
  }
}
