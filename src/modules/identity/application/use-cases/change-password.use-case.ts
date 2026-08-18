import { createHash } from 'crypto';
import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { JwtPort } from '../../domain/ports/jwt.port';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { IdempotencyPort } from '../../domain/ports/idempotency.port';
import { ChangePasswordUnitOfWorkPort } from '../../domain/ports/change-password-unit-of-work.port';
import {
  authenticationRequired,
  invalidCurrentPassword,
  idempotencyKeyReusedPasswordChange,
} from '../../domain/identity-errors';

/** Comando de entrada para `POST /auth/password-change` (MSF-ID-003). */
export interface ChangePasswordCommand {
  /** Actor autenticado (extraído por el guard). */
  readonly actorId: string;
  /** ID de la sesión actual que se conserva y rota. */
  readonly currentSessionId: string;
  /** Contraseña actual en claro (validada por el hasher, nunca loggeada). */
  readonly currentPassword: string;
  /** Nueva contraseña en claro (validada por transporte, longitud 12..128). */
  readonly newPassword: string;
  /** `Idempotency-Key` validado por el header-validator de transporte. */
  readonly idempotencyKey: string;
}

/**
 * Resultado de la primera ejecución exitosa (cambio de contraseña).
 * El token vive exclusivamente en memoria de respuesta; nunca se persiste.
 */
export interface ChangePasswordChangedResult {
  readonly kind: 'changed';
  /** Refresh token opaco nuevo (a enviar en Set-Cookie HttpOnly/Secure). */
  readonly newRefreshToken: string;
  /** Nueva expiración del cookie. */
  readonly cookieExpiresAt: Date;
}

/**
 * Resultado de replay idempotente equivalente.
 * No se repite mutación, no se rota cookie, no se revoca sesión.
 */
export interface ChangePasswordReplayResult {
  readonly kind: 'replay';
}

/** Resultado discriminado del caso de uso. */
export type ChangePasswordResult =
  | ChangePasswordChangedResult
  | ChangePasswordReplayResult;

/**
 * Snapshot mínimo persistido en `idempotency_records.response_json` para
 * replay de password-change (ADR-020). Contiene SOLO status 204 y body_hash;
 * NUNCA persiste refresh token, hash de sesión, contraseña, secreto ni
 * credenciales derivadas.
 */
interface PasswordChangeSnapshot {
  readonly status: 204;
  readonly body_hash: string;
}

interface ChangePasswordUseCasePorts {
  readonly userRepo: UserRepositoryPort;
  readonly sessionRepo: SessionRepositoryPort;
  readonly passwordHasher: PasswordHasherPort;
  readonly jwt: JwtPort;
  readonly cookieToken: CookieTokenPort;
  readonly clock: ClockPort;
  readonly idempotency: IdempotencyPort;
  readonly unitOfWork: ChangePasswordUnitOfWorkPort;
  /** TTL de cookie de refresh en ms (default 10 min para alinearse con sesiones). */
  readonly refreshCookieTtlMs: number;
}

/** Alcance de idempotencia: actor + clave. */
function passwordChangeScope(actorId: string): string {
  return `password-change:${actorId}`;
}

/**
 * Resultado discriminado de la lógica de idempotencia dentro de la UoW.
 *
 * Se devuelve como valor (no como excepción) para que el adapter de
 * transacción no lo capture y lo traduzca a `TECHNICAL_DEPENDENCY_FAILURE`.
 * El caso de uso interpreta el resultado fuera de la transacción.
 */
type IdempotencyOutcome =
  | { readonly kind: 'replay' }
  | { readonly kind: 'conflict'; readonly error: DomainError }
  | { readonly kind: 'created'; readonly response: ChangePasswordChangedResult };

/**
 * Caso de uso `POST /auth/password-change` (MSF-ID-003, ADR-020).
 *
 * Reglas (Master Spec AC-07, OpenAPI `changePassword` y ADR-020):
 *  1. Requiere actor autenticado (401 si no).
 *  2. **Detección de replay ANTES de validar `current_password`** (ADR-020):
 *     - Primera ejecución: valida `current_password` (Argon2id), cambia hash,
 *       limpia `must_change_password`, revoca las demás sesiones, rota la
 *       cookie de refresco y responde `204` + `Set-Cookie`.
 *     - Replay equivalente (mismo principal, clave y cuerpo canónico):
 *       responde `204` **sin** `Set-Cookie`, sin repetir mutación, sin
 *       re-validar `current_password`, sin rotar cookie ni revocar.
 *     - Replay divergente (misma clave con cuerpo distinto):
 *       responde `409 IDEMPOTENCY_KEY_REUSED`.
 *  3. **Snapshot mínimo** (ADR-020): `idempotency_records` persiste SOLO
 *     `{ status: 204, body_hash }`. NUNCA persiste refresh token, hash de
 *     sesión, contraseña, secreto ni credenciales derivadas.
 *  4. Unidad transaccional atómica (SERIALIZABLE):
 *     - Comprueba/guarda idempotencia con `findForUpdate` (FOR UPDATE lock).
 *     - Actualiza `password_hash` y limpia `must_change_password`.
 *     - Rota el refresh token de `currentSessionId` (nuevo hash + expiración).
 *     - Revoca todas las demás sesiones del usuario.
 *     - Rollback total ante cualquier fallo (consistencia).
 *  5. **Concurrencia** (ADR-020): retry/relectura determinista con
 *     `UNIQUE(scope,idempotency_key)` + `FOR UPDATE` + reread del registro
 *     bloqueado; nunca un `500` espurio ni doble rotación de cookie.
 *
 * **Flujo optimizado (ADR-020):** la detección de replay se realiza con
 * una lectura `find` (sin lock) ANTES de validar `current_password`. Esto
 * evita el cómputo Argon2id innecesario en reintentos idempotentes. La
 * transacción SERIALIZABLE con `findForUpdate` maneja la carrera concurrente.
 */
export class ChangePasswordUseCase {
  constructor(private readonly ports: ChangePasswordUseCasePorts) {}

  async execute(
    command: ChangePasswordCommand,
  ): Promise<Result<ChangePasswordResult, DomainError>> {
    if (!command.actorId) {
      return fail(authenticationRequired());
    }

    const scope = passwordChangeScope(command.actorId);
    const bodyCanonical = JSON.stringify({
      current_password: command.currentPassword,
      new_password: command.newPassword,
    });
    const bodyHash = createHash('sha256').update(bodyCanonical).digest('hex');

    // ── Fase 1: Detección de replay ANTES de validar current_password ──
    // (ADR-020: "la detección de replay ocurre antes de volver a exigir
    // current_password"). Lectura sin lock para no sostener el_BEGIN
    // durante la verificación Argon2id en requests nuevos.
    const existingRecord = await this.ports.idempotency.find(scope, command.idempotencyKey);
    if (existingRecord) {
      if (existingRecord.bodyHash !== bodyHash) {
        return fail(idempotencyKeyReusedPasswordChange());
      }
      // Replay equivalente: mismo principal + misma clave + mismo body_hash.
      // Devuelve 204 sin Set-Cookie, sin mutar, sin hashear, sin rotar.
      return ok({ kind: 'replay' });
    }

    // ── Fase 2: Validar current_password solo si NO es replay ──
    // (ADR-020: "una solicitud nueva sí la valida (422 CURRENT_PASSWORD_INVALID)").
    const userResult = await this.ports.userRepo.findById(command.actorId);
    if (isFailure(userResult)) return userResult;
    const user = userResult.value;
    if (!user) {
      return fail(authenticationRequired());
    }
    const verifyResult = await this.ports.passwordHasher.verify(
      command.currentPassword,
      user.passwordHash,
    );
    if (isFailure(verifyResult)) return verifyResult;
    if (!verifyResult.value) {
      return fail(invalidCurrentPassword());
    }

    // ── Fase 3: Transacción atómica (SERIALIZABLE) ──
    // El hash de la nueva contraseña se difiere hasta confirmar que no
    // es un replay de carrera (evita Argon2id innecesario en reintentos).
    const uow = await this.ports.unitOfWork.run(
      command.currentSessionId,
      async (tx) => {
        // Releer con FOR UPDATE para resolver carrera concurrente.
        const existing = await tx.idempotency.findForUpdate(
          scope,
          command.idempotencyKey,
        );

        if (existing) {
          if (existing.bodyHash !== bodyHash) {
            return {
              kind: 'conflict' as const,
              error: idempotencyKeyReusedPasswordChange(),
            };
          }
          // Replay de carrera: el registro se creó entre la lectura
          // inicial y esta transacción. Devuelve replay sin rotar token.
          return { kind: 'replay' as const };
        }

        // Request nuevo: hashear contraseña (Argon2id), generar token,
        // ejecutar mutaciones, persistir snapshot mínimo.
        const hashResult = await this.ports.passwordHasher.hash(
          command.newPassword,
        );
        if (isFailure(hashResult)) {
          return { kind: 'conflict' as const, error: hashResult.error };
        }
        const newPasswordHash = hashResult.value;
        const newRefreshToken = this.ports.cookieToken.generate();
        const newRefreshTokenHash =
          this.ports.cookieToken.hash(newRefreshToken);
        const cookieExpiresAt = new Date(
          this.ports.clock.now().getTime() + this.ports.refreshCookieTtlMs,
        );

        const updatePwdResult = await tx.userRepo.updatePassword(command.actorId, newPasswordHash);
        if (isFailure(updatePwdResult)) {
          return { kind: 'conflict' as const, error: updatePwdResult.error };
        }
        const rotateResult = await tx.sessionRepo.rotateRefreshToken(
          command.currentSessionId,
          newRefreshTokenHash,
          cookieExpiresAt,
        );
        if (isFailure(rotateResult)) {
          return { kind: 'conflict' as const, error: rotateResult.error };
        }
        const revokeResult = await tx.sessionRepo.revokeAllForUserExcept(
          command.actorId,
          command.currentSessionId,
        );
        if (isFailure(revokeResult)) {
          return { kind: 'conflict' as const, error: revokeResult.error };
        }

        // Snapshot mínimo (ADR-020): SOLO status + body_hash.
        // NUNCA refresh token, hash de sesión, contraseña o credenciales.
        const snapshot: PasswordChangeSnapshot = {
          status: 204,
          body_hash: bodyHash,
        };
        await tx.idempotency.save(
          scope,
          command.idempotencyKey,
          bodyHash,
          snapshot,
        );

        return {
          kind: 'created' as const,
          response: { kind: 'changed' as const, newRefreshToken, cookieExpiresAt },
        };
      },
    );

    if (isFailure(uow)) {
      return fail(uow.error);
    }

    const outcome = uow.value;
    if (outcome.kind === 'conflict') {
      return fail(outcome.error);
    }
    if (outcome.kind === 'replay') {
      return ok({ kind: 'replay' });
    }

    return ok(outcome.response);
  }
}
