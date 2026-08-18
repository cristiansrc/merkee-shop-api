import { createHash } from 'crypto';
import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { IdempotencyPort } from '../../domain/ports/idempotency.port';
import { UpdateProfileUnitOfWorkPort } from '../../domain/ports/update-profile-unit-of-work.port';
import {
  authenticationRequired,
  idempotencyKeyReusedProfileUpdate,
} from '../../domain/identity-errors';
import type { UserDto } from '../../../../contract/application/dto';

/** Comando de entrada para actualizar perfil (`PATCH /me`). */
export interface UpdateProfileCommand {
  /** Actor autenticado (extraído por el guard; no confiar en el body). */
  readonly actorId: string;
  /** `Idempotency-Key` validado por el header-validator de transporte. */
  readonly idempotencyKey: string;
  /** Cuerpo canónico de la solicitud (validado por transporte). */
  readonly body: {
    readonly display_name?: string;
    readonly phone?: string | null;
  };
}

/** Resultado del caso de uso. */
export interface UpdateProfileResult {
  readonly user: UserDto;
}

interface UpdateProfileUseCasePorts {
  readonly userRepo: UserRepositoryPort;
  readonly idempotency: IdempotencyPort;
  readonly unitOfWork: UpdateProfileUnitOfWorkPort;
}

/** Alcance de idempotencia para `PATCH /me`: actor + clave. */
function profileUpdateScope(actorId: string): string {
  return `profile-update:${actorId}`;
}

/**
 * Resultado discriminado de la lógica de idempotencia dentro de la UoW.
 *
 * Se devuelve como valor (no como excepción) para que el adapter de
 * transacción no lo capture y lo traduzca a `TECHNICAL_DEPENDENCY_FAILURE`.
 * El caso de uso interpreta el resultado fuera de la transacción.
 */
type IdempotencyOutcome =
  | { readonly kind: 'replay'; readonly response: UpdateProfileResult }
  | { readonly kind: 'conflict'; readonly error: DomainError }
  | { readonly kind: 'created'; readonly response: UpdateProfileResult };

/**
 * Caso de uso de actualización de perfil (`PATCH /me`, MSF-ID-003).
 *
 * Solo modifica `display_name` y `phone`; `email` y `role` son inmutables
 * por API. La dirección de entrega no es atributo de perfil: es snapshot
 * de orden (Master Spec AC-07). El caso respeta la idempotencia declarada
 * en OpenAPI: misma `(actor, Idempotency-Key, body)` → mismo resultado;
 * clave divergente → `409 IDEMPOTENCY_KEY_REUSED`.
 *
 * **Bloqueo de idempotencia concurrente (MSF-ID-003):** La comprobación
 * y guardado de idempotencia se resuelven dentro de la misma transacción
 * SERIALIZABLE con `findForUpdate` (FOR UPDATE lock). Dos requests
 * concurrentes con la misma clave no duplican la actualización: el segundo
 * transaction espera al commit del primero y devuelve replay.
 */
export class UpdateProfileUseCase {
  constructor(private readonly ports: UpdateProfileUseCasePorts) {}

  async execute(
    command: UpdateProfileCommand,
  ): Promise<Result<UpdateProfileResult, DomainError>> {
    if (!command.actorId) {
      return fail(authenticationRequired());
    }

    const scope = profileUpdateScope(command.actorId);
    const bodyCanonical = JSON.stringify(command.body ?? {});
    const bodyHash = createHash('sha256')
      .update(bodyCanonical)
      .digest('hex');

    // La lógica de idempotencia (findForUpdate + save) y la actualización
    // de perfil se ejecutan dentro de la misma transacción SERIALIZABLE.
    // Devolvemos un IdempotencyOutcome discriminado para que el adapter
    // de transacción no capture errores de dominio como fallos técnicos.
    const uow = await this.ports.unitOfWork.run(async (tx) => {
      const existing = await tx.idempotency.findForUpdate(
        scope,
        command.idempotencyKey,
      );

      if (existing) {
        if (existing.bodyHash !== bodyHash) {
          return {
            kind: 'conflict' as const,
            error: idempotencyKeyReusedProfileUpdate(),
          };
        }
        // Replay: devolver la respuesta almacenada sin re-ejecutar efectos.
        return {
          kind: 'replay' as const,
          response: existing.responseJson as UpdateProfileResult,
        };
      }

      // Request nuevo: ejecutar la mutación y persistir idempotencia.
      const updatedResult = await tx.userRepo.updateProfile(command.actorId, {
        displayName: command.body.display_name ?? undefined,
        phone: command.body.phone,
      });
      if (isFailure(updatedResult)) {
        return { kind: 'conflict' as const, error: updatedResult.error };
      }
      const updated = updatedResult.value;

      const response: UpdateProfileResult = {
        user: {
          id: updated.id,
          display_name: updated.displayName,
          email: updated.email,
          role: updated.role,
          must_change_password: updated.mustChangePassword,
          phone: updated.phone,
        },
      };

      await tx.idempotency.save(
        scope,
        command.idempotencyKey,
        bodyHash,
        response,
      );

      return { kind: 'created' as const, response };
    });

    if (isFailure(uow)) {
      return fail(uow.error);
    }

    const outcome = uow.value;
    if (outcome.kind === 'conflict') {
      return fail(outcome.error);
    }

    return ok(outcome.response);
  }
}
