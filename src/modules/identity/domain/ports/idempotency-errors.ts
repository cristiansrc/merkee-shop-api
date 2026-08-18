import { domainError, DomainErrorCode } from '../../../../shared/domain/domain-error';

/** Admin no autorizado para provisión (solo admin con must_change_password=false). */
export const actorNotAuthorizedForProvision = () => {
  return domainError(
    DomainErrorCode.ACTOR_NOT_AUTHORIZED,
    'authorization',
    'identity.actor_not_authorized_for_provision',
  );
};

/** Recurso provisionado no encontrado durante replay (404). */
export const provisionedResourceNotFound = () => {
  return domainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'not_found',
    'identity.provisioned_resource_not_found',
  );
};
