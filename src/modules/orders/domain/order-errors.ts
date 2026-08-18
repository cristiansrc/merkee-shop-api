import {
  DomainError,
  domainError,
  DomainErrorCode,
} from '../../../shared/domain/domain-error';

/** Fábricas de DomainError del módulo `orders` (Master Spec §ROP). */
export const OrderErrors = {
  /** Recurso no encontrado → 404. */
  resourceNotFound(): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not.found',
    );
  },

  /** Actor no autorizado para acceder a la orden → 403. */
  actorNotAuthorized(): DomainError {
    return domainError(
      DomainErrorCode.ACTOR_NOT_AUTHORIZED,
      'authorization',
      'actor.not.authorized',
    );
  },

  /** Error técnico no clasificable → 500. */
  technicalFailure(): DomainError {
    return domainError(
      DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      'technical',
      'technical.dependency.failure',
    );
  },
};
