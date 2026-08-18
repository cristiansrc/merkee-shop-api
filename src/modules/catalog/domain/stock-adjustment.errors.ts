import { DomainError, domainError, DomainErrorCode } from '../../../shared/domain/domain-error';

/** Fábricas de DomainError del ajuste de stock (ADR-011). */
export const StockAdjustmentErrors = {
  resourceNotFound(): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not.found',
    );
  },

  stockInsufficient(): DomainError {
    return domainError(
      DomainErrorCode.STOCK_INSUFFICIENT,
      'unprocessable',
      'stock.insufficient',
    );
  },

  idempotencyKeyReused(): DomainError {
    return domainError(
      DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
      'conflict',
      'idempotency.key.reused',
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
