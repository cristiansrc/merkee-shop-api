import { actorNotAuthorizedForProvision, provisionedResourceNotFound } from './idempotency-errors';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('identity idempotency-errors', () => {
  it('actorNotAuthorizedForProvision retorna ACTOR_NOT_AUTHORIZED', () => {
    const error = actorNotAuthorizedForProvision();
    expect(error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('identity.actor_not_authorized_for_provision');
  });

  it('provisionedResourceNotFound retorna RESOURCE_NOT_FOUND', () => {
    const error = provisionedResourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
    expect(error.messageKey).toBe('identity.provisioned_resource_not_found');
  });
});
