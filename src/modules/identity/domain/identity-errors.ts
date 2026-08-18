import { domainError, DomainErrorCode } from '../../../shared/domain/domain-error';
import type { DomainError } from '../../../shared/domain/domain-error';

/**
 * Fábrica de `DomainError` específicos del módulo `identity`.
 * Cada helper construye un error del catálogo estable (ADR-017) sin secretos ni PII.
 */

export function emailAlreadyRegistered(): DomainError {
  return domainError(
    DomainErrorCode.EMAIL_ALREADY_REGISTERED,
    'conflict',
    'identity.email_already_registered',
  );
}

export function invalidCredentials(): DomainError {
  return domainError(
    DomainErrorCode.INVALID_CREDENTIALS,
    'authentication',
    'identity.invalid_credentials',
  );
}

export function sessionNotFoundOrExpired(): DomainError {
  return domainError(
    DomainErrorCode.AUTHENTICATION_REQUIRED,
    'authentication',
    'identity.session_not_found_or_expired',
  );
}

export function authenticationRequired(): DomainError {
  return domainError(
    DomainErrorCode.AUTHENTICATION_REQUIRED,
    'authentication',
    'auth.required',
  );
}

export function actorNotAuthorized(): DomainError {
  return domainError(
    DomainErrorCode.ACTOR_NOT_AUTHORIZED,
    'authorization',
    'auth.actor_not_authorized',
  );
}

export function initialPasswordChangeRequired(): DomainError {
  return domainError(
    DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
    'authorization',
    'admin.initial_password_change_required',
  );
}

export function provisionedResourceNotFound(): DomainError {
  return domainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'not_found',
    'identity.provisioned_resource_not_found',
  );
}

export function idempotencyKeyReused(): DomainError {
  return domainError(
    DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
    'conflict',
    'idempotency.key_reused',
  );
}

export function activationTokenInvalidOrExpired(): DomainError {
  return domainError(
    DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED,
    'unprocessable',
    'activation.token_invalid_or_expired',
  );
}

/** Token de restablecimiento inválido o expirado (422). */
export const passwordResetTokenInvalidOrExpired = () => {
  return domainError(
    DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
    'unprocessable',
    'auth.password_reset_token_invalid_or_expired',
  );
};

/** Contraseña actual inválida para el cambio de contraseña (422). */
export const invalidCurrentPassword = () => {
  return domainError(
    DomainErrorCode.CURRENT_PASSWORD_INVALID,
    'unprocessable',
    'auth.invalid_current_password',
  );
};

/** Nueva contraseña demasiado corta (mínimo 12 caracteres). Validación de transporte (400). */
export const newPasswordTooShort = () => {
  return domainError(
    DomainErrorCode.INVALID_DOMAIN_INPUT,
    'validation',
    'auth.new_password_too_short',
  );
};

/** Clave de idempotencia reutilizada con cuerpo divergente en perfil (409). */
export const idempotencyKeyReusedProfileUpdate = () => {
  return domainError(
    DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
    'conflict',
    'idempotency.key_reused_profile_update',
  );
};

/** Clave de idempotencia reutilizada con cuerpo divergente en cambio de contraseña (409). */
export const idempotencyKeyReusedPasswordChange = () => {
  return domainError(
    DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
    'conflict',
    'idempotency.key_reused_password_change',
  );
};

/** Error técnico inesperado (500). */
export function technicalFailure(): DomainError {
  return domainError(
    DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
    'technical',
    'technical.dependency_failure',
  );
}
