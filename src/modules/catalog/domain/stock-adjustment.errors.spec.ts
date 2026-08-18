import { StockAdjustmentErrors } from './stock-adjustment.errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('StockAdjustmentErrors', () => {
  it('resourceNotFound retorna el código correcto', () => {
    const error = StockAdjustmentErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
    expect(error.messageKey).toBe('resource.not.found');
  });

  it('stockInsufficient retorna el código correcto', () => {
    const error = StockAdjustmentErrors.stockInsufficient();
    expect(error.code).toBe(DomainErrorCode.STOCK_INSUFFICIENT);
    expect(error.kind).toBe('unprocessable');
    expect(error.messageKey).toBe('stock.insufficient');
  });

  it('idempotencyKeyReused retorna el código correcto', () => {
    const error = StockAdjustmentErrors.idempotencyKeyReused();
    expect(error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('idempotency.key.reused');
  });

  it('authenticationRequired retorna el código correcto', () => {
    const error = StockAdjustmentErrors.authenticationRequired();
    expect(error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(error.kind).toBe('authentication');
    expect(error.messageKey).toBe('authentication.required');
  });

  it('actorNotAuthorized retorna el código correcto', () => {
    const error = StockAdjustmentErrors.actorNotAuthorized();
    expect(error.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('actor.not.authorized');
  });

  it('initialPasswordChangeRequired retorna el código correcto', () => {
    const error = StockAdjustmentErrors.initialPasswordChangeRequired();
    expect(error.code).toBe(DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED);
    expect(error.kind).toBe('authorization');
    expect(error.messageKey).toBe('initial.password.change.required');
  });

  it('technicalFailure retorna el código correcto', () => {
    const error = StockAdjustmentErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
    expect(error.messageKey).toBe('technical.dependency.failure');
  });
});
