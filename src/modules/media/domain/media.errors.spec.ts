import {
  initialPasswordChangeRequired,
  actorNotAuthorized,
  authenticationRequired,
  idempotencyKeyReused,
  technicalFailure,
  invalidContentType,
  invalidContentLength,
} from './media.errors';

describe('media.errors', () => {
  it('initialPasswordChangeRequired tiene código correcto', () => {
    const error = initialPasswordChangeRequired();
    expect(error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
    expect(error.kind).toBe('authorization');
  });

  it('actorNotAuthorized tiene código correcto', () => {
    const error = actorNotAuthorized();
    expect(error.code).toBe('ACTOR_NOT_AUTHORIZED');
    expect(error.kind).toBe('authorization');
  });

  it('authenticationRequired tiene código correcto', () => {
    const error = authenticationRequired();
    expect(error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(error.kind).toBe('authentication');
  });

  it('idempotencyKeyReused tiene código correcto', () => {
    const error = idempotencyKeyReused();
    expect(error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(error.kind).toBe('conflict');
  });

  it('technicalFailure tiene código correcto', () => {
    const error = technicalFailure();
    expect(error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
    expect(error.kind).toBe('technical');
  });

  it('invalidContentType tiene código correcto', () => {
    const error = invalidContentType();
    expect(error.code).toBe('INVALID_DOMAIN_INPUT');
    expect(error.kind).toBe('validation');
  });

  it('invalidContentLength tiene código correcto', () => {
    const error = invalidContentLength();
    expect(error.code).toBe('INVALID_DOMAIN_INPUT');
    expect(error.kind).toBe('validation');
  });

  it('ningún error contiene metadata con PII ni secretos', () => {
    const errors = [
      initialPasswordChangeRequired(),
      actorNotAuthorized(),
      authenticationRequired(),
      idempotencyKeyReused(),
      technicalFailure(),
      invalidContentType(),
      invalidContentLength(),
    ];
    for (const error of errors) {
      // No debe haber metadata con datos sensibles
      expect(error.metadata).toBeUndefined();
      // messageKey es una clave de localización, no PII
      expect(typeof error.messageKey).toBe('string');
      expect(error.messageKey.length).toBeGreaterThan(0);
    }
  });
});
