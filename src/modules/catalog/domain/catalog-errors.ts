import { DomainError, domainError, DomainErrorCode } from '../../../shared/domain/domain-error';

/** Fábricas de DomainError del catálogo (Master Spec §ROP). */
export const CatalogErrors = {
  resourceNotFound(): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not.found',
    );
  },

  versionMismatch(): DomainError {
    return domainError(
      DomainErrorCode.VERSION_MISMATCH,
      'conflict',
      'version.mismatch',
    );
  },

  idempotencyKeyReused(): DomainError {
    return domainError(
      DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
      'conflict',
      'idempotency.key.reused',
    );
  },

  categoryOccupied(): DomainError {
    return domainError(
      DomainErrorCode.INVALID_STATE_TRANSITION,
      'conflict',
      'category.occupied',
    );
  },

  invalidDomainInput(field: string, reason: string): DomainError {
    return domainError(
      DomainErrorCode.INVALID_DOMAIN_INPUT,
      'validation',
      'invalid.domain.input',
      { details: [{ field, reason }] },
    );
  },

  authenticationRequired(): DomainError {
    return domainError(
      DomainErrorCode.AUTHENTICATION_REQUIRED,
      'authentication',
      'authentication.required',
    );
  },

  actorNotAuthorized(): DomainError {
    return domainError(
      DomainErrorCode.ACTOR_NOT_AUTHORIZED,
      'authorization',
      'actor.not.authorized',
    );
  },

  initialPasswordChangeRequired(): DomainError {
    return domainError(
      DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
      'authorization',
      'initial.password.change.required',
    );
  },

  technicalFailure(): DomainError {
    return domainError(
      DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      'technical',
      'technical.dependency.failure',
    );
  },
};
