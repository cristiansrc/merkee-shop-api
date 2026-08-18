/**
 * Tipos base ROP (Railway Oriented Programming) compartidos.
 *
 * Todo puerto de entrada y caso de uso de `domain` o `application` retorna
 * exactamente `Result<Success, DomainError>` (ADR-017 / Master Spec §ROP).
 * `Success` es el DTO de aplicación o `void` para efectos sin representación.
 *
 * Este archivo NO importa NestJS, Prisma ni HTTP: es TypeScript puro.
 */

export type Result<Success, DomainError> =
  | SuccessResult<Success, DomainError>
  | FailureResult<Success, DomainError>;

export interface SuccessResult<Success, DomainError> {
  readonly ok: true;
  readonly value: Success;
}

export interface FailureResult<Success, DomainError> {
  readonly ok: false;
  readonly error: DomainError;
}

/** Construye una rama `Success` del rail. */
export function ok<Success, DomainError = never>(
  value: Success,
): Result<Success, DomainError> {
  return { ok: true, value };
}

/** Construye una rama `Failure` del rail. */
export function fail<Success, DomainError>(
  error: DomainError,
): Result<Success, DomainError> {
  return { ok: false, error };
}

/** Type guard para la rama `Success`. */
export function isSuccess<Success, DomainError>(
  result: Result<Success, DomainError>,
): result is SuccessResult<Success, DomainError> {
  return result.ok === true;
}

/** Type guard para la rama `Failure`. */
export function isFailure<Success, DomainError>(
  result: Result<Success, DomainError>,
): result is FailureResult<Success, DomainError> {
  return result.ok === false;
}
