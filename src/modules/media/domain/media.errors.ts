import { domainError, DomainErrorCode } from '../../../shared/domain/domain-error';
import type { DomainError } from '../../../shared/domain/domain-error';

/**
 * Fábrica de `DomainError` específicos del módulo `media`.
 * Cada helper construye un error del catálogo estable (ADR-017) sin secretos ni PII.
 */

/** Admin debe cambiar contraseña inicial antes de subir media (403). */
export function initialPasswordChangeRequired(): DomainError {
  return domainError(
    DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
    'authorization',
    'admin.initial_password_change_required',
  );
}

/** Actor no autorizado para subir media (403). */
export function actorNotAuthorized(): DomainError {
  return domainError(
    DomainErrorCode.ACTOR_NOT_AUTHORIZED,
    'authorization',
    'auth.actor_not_authorized',
  );
}

/** Autenticación requerida (401). */
export function authenticationRequired(): DomainError {
  return domainError(
    DomainErrorCode.AUTHENTICATION_REQUIRED,
    'authentication',
    'auth.required',
  );
}

/** Clave de idempotencia reutilizada con cuerpo divergente (409). */
export function idempotencyKeyReused(): DomainError {
  return domainError(
    DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
    'conflict',
    'idempotency.key_reused',
  );
}

/** Error técnico inesperado (500). */
export function technicalFailure(): DomainError {
  return domainError(
    DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
    'technical',
    'technical.dependency_failure',
  );
}

/** Content-Type no permitido para subida de media (400). */
export function invalidContentType(): DomainError {
  return domainError(
    DomainErrorCode.INVALID_DOMAIN_INPUT,
    'validation',
    'media.invalid_content_type',
  );
}

/** Tamaño de archivo fuera de rango permitido (400). */
export function invalidContentLength(): DomainError {
  return domainError(
    DomainErrorCode.INVALID_DOMAIN_INPUT,
    'validation',
    'media.invalid_content_length',
  );
}
