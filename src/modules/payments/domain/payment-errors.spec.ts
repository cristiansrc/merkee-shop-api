import { paymentErrors } from './payment-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('paymentErrors (completo)', () => {
  it('technicalFailure crea DomainError con código correcto', () => {
    const error = paymentErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
    expect(error.messageKey).toBe('TECHNICAL_DEPENDENCY_FAILURE');
  });

  it('technicalFailure acepta metadata sin PII', () => {
    const error = paymentErrors.technicalFailure({ provider: 'WOMPI', statusCode: 500 });
    expect(error.metadata).toEqual({ provider: 'WOMPI', statusCode: 500 });
  });

  it('paymentHoldNotConsumable crea DomainError con código correcto', () => {
    const error = paymentErrors.paymentHoldNotConsumable();
    expect(error.code).toBe(DomainErrorCode.PAYMENT_HOLD_NOT_CONSUMABLE);
    expect(error.kind).toBe('unprocessable');
    expect(error.messageKey).toBe('PAYMENT_HOLD_NOT_CONSUMABLE');
  });

  it('resourceNotFound crea DomainError con código correcto', () => {
    const error = paymentErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
    expect(error.messageKey).toBe('RESOURCE_NOT_FOUND');
  });

  it('invalidDomainInput crea DomainError con código correcto', () => {
    const error = paymentErrors.invalidDomainInput();
    expect(error.code).toBe(DomainErrorCode.INVALID_DOMAIN_INPUT);
    expect(error.kind).toBe('validation');
    expect(error.messageKey).toBe('INVALID_DOMAIN_INPUT');
  });

  it('duplicateWebhookEvent crea DomainError con código correcto', () => {
    const error = paymentErrors.duplicateWebhookEvent();
    expect(error.code).toBe(DomainErrorCode.DUPLICATE_WEBHOOK_EVENT);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('DUPLICATE_WEBHOOK_EVENT');
  });

  it('invalidWebhookSignature crea DomainError con código correcto', () => {
    const error = paymentErrors.invalidWebhookSignature();
    expect(error.code).toBe(DomainErrorCode.INVALID_WEBHOOK_SIGNATURE);
    expect(error.kind).toBe('authentication');
    expect(error.messageKey).toBe('webhook.invalid_signature');
  });

  it('invalidStateTransition crea DomainError con código correcto', () => {
    const error = paymentErrors.invalidStateTransition();
    expect(error.code).toBe(DomainErrorCode.INVALID_STATE_TRANSITION);
    expect(error.kind).toBe('conflict');
    expect(error.messageKey).toBe('state.invalid_transition');
  });

  it('ningún error contiene PII en messageKey', () => {
    const errors = [
      paymentErrors.technicalFailure(),
      paymentErrors.paymentHoldNotConsumable(),
      paymentErrors.resourceNotFound(),
      paymentErrors.invalidDomainInput(),
      paymentErrors.duplicateWebhookEvent(),
      paymentErrors.invalidWebhookSignature(),
      paymentErrors.invalidStateTransition(),
    ];
    for (const error of errors) {
      expect(error.messageKey).not.toMatch(/email|password|token|card|cvv/i);
    }
  });
});
