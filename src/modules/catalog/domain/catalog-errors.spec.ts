import { CatalogErrors } from './catalog-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('CatalogErrors', () => {
  it('resourceNotFound retorna el código correcto', () => {
    const error = CatalogErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
    expect(error.messageKey).toBe('resource.not.found');
  });

  it('versionMismatch retorna el código correcto', () => {
    const error = CatalogErrors.versionMismatch();
    expect(error.code).toBe(DomainErrorCode.VERSION_MISMATCH);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('version.mismatch');
  });

  it('idempotencyKeyReused retorna el código correcto', () => {
    const error = CatalogErrors.idempotencyKeyReused();
    expect(error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('idempotency.key.reused');
  });

  it('categoryOccupied retorna el código correcto', () => {
    const error = CatalogErrors.categoryOccupied();
    expect(error.code).toBe(DomainErrorCode.INVALID_STATE_TRANSITION);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('category.occupied');
  });

  it('invalidDomainInput retorna el código correcto con detalles', () => {
    const error = CatalogErrors.invalidDomainInput('name', 'requerido');
    expect(error.code).toBe(DomainErrorCode.INVALID_DOMAIN_INPUT);
    expect(error.kind).toBe('validation');
    expect(error.messageKey).toBe('invalid.domain.input');
    expect(error.metadata).toEqual({
      details: [{ field: 'name', reason: 'requerido' }],
    });
  });

  it('authenticationRequired retorna el código correcto', () => {
    const error = CatalogErrors.authenticationRequired();
    expect(error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(error.kind).toBe('authentication');
    expect(error.messageKey).toBe('authentication.required');
  });

  it('actorNotAuthorized retorna el código correcto', () => {
    const error = CatalogErrors.actorNotAuthorized();
    expect(error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('actor.not.authorized');
  });

  it('initialPasswordChangeRequired retorna el código correcto', () => {
    const error = CatalogErrors.initialPasswordChangeRequired();
    expect(error.code).toBe(DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('initial.password.change.required');
  });

  it('technicalFailure retorna el código correcto', () => {
    const error = CatalogErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
    expect(error.messageKey).toBe('technical.dependency.failure');
  });
});
