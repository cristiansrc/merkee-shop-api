import { OrderErrors } from './order-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('OrderErrors', () => {
  it('resourceNotFound retorna el código correcto', () => {
    const error = OrderErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
    expect(error.messageKey).toBe('resource.not.found');
  });

  it('actorNotAuthorized retorna el código correcto', () => {
    const error = OrderErrors.actorNotAuthorized();
    expect(error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('actor.not.authorized');
  });

  it('technicalFailure retorna el código correcto', () => {
    const error = OrderErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
    expect(error.messageKey).toBe('technical.dependency.failure');
  });
});
