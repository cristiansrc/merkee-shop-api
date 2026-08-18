import { Injectable } from '@nestjs/common';
import { IdempotencyScopeEvaluatorPort } from '../../domain/ports/idempotency-scope-evaluator.port';
import { ADMIN_PROVISION_SCOPE_PREFIX } from '../../domain/idempotency-scope';

/**
 * Evaluador de estado de `scope` para la purga (ADR-018).
 *
 * Solo `admin-provision:{actorId}` con `actorId` un UUID válido se considera
 * terminal: la operación asociada es terminal al confirmar la transacción que
 * crea usuario, token e `idempotency_records`; el canje posterior del token es
 * un flujo separado y no prolonga el replay. Por tanto, estos scopes nunca
 * tienen operación pendiente y son purgables.
 *
 * Cualquier scope desconocido o mal formado (prefijo sin UUID válido, UUID
 * inválido, prefijo desconocido o cadena vacía) se trata como pendiente de
 * forma conservadora: no se purga hasta que una delta defina su semántica de
 * operación pendiente.
 */
@Injectable()
export class AdminProvisionScopeEvaluatorAdapter
  implements IdempotencyScopeEvaluatorPort
{
  async hasPendingOperation(scope: string): Promise<boolean> {
    return !isValidAdminProvisionScope(scope);
  }
}

/** UUID canónico (v1–v8) en minúsculas, sin llaves ni variantes no estándar. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** `true` solo si el scope es `admin-provision:<UUID válido>`. */
function isValidAdminProvisionScope(scope: string): boolean {
  if (!scope.startsWith(ADMIN_PROVISION_SCOPE_PREFIX)) {
    return false;
  }
  const actorId = scope.slice(ADMIN_PROVISION_SCOPE_PREFIX.length);
  return UUID_PATTERN.test(actorId);
}
