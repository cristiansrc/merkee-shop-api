import {
  emailAlreadyRegistered,
  invalidCredentials,
  sessionNotFoundOrExpired,
  authenticationRequired,
  actorNotAuthorized,
  initialPasswordChangeRequired,
  provisionedResourceNotFound,
  idempotencyKeyReused,
  activationTokenInvalidOrExpired,
  passwordResetTokenInvalidOrExpired,
  invalidCurrentPassword,
  newPasswordTooShort,
  idempotencyKeyReusedProfileUpdate,
  idempotencyKeyReusedPasswordChange,
  technicalFailure,
} from './identity-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('identity-errors (completo)', () => {
  it('emailAlreadyRegistered retorna EMAIL_ALREADY_REGISTERED', () => {
    const err = emailAlreadyRegistered();
    expect(err.code).toBe(DomainErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(err.kind).toBe('conflict');
    expect(err.messageKey).toBe('identity.email_already_registered');
  });

  it('invalidCredentials retorna INVALID_CREDENTIALS', () => {
    const err = invalidCredentials();
    expect(err.code).toBe(DomainErrorCode.INVALID_CREDENTIALS);
    expect(err.kind).toBe('authentication');
    expect(err.messageKey).toBe('identity.invalid_credentials');
  });

  it('sessionNotFoundOrExpired retorna AUTHENTICATION_REQUIRED', () => {
    const err = sessionNotFoundOrExpired();
    expect(err.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(err.kind).toBe('authentication');
    expect(err.messageKey).toBe('identity.session_not_found_or_expired');
  });

  it('authenticationRequired retorna AUTHENTICATION_REQUIRED', () => {
    const err = authenticationRequired();
    expect(err.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(err.kind).toBe('authentication');
    expect(err.messageKey).toBe('auth.required');
  });

  it('actorNotAuthorized retorna ACTOR_NOT_AUTHORIZED', () => {
    const err = actorNotAuthorized();
    expect(err.code).toBe(DomainErrorCode.ACTOR_NOT_AUTHORIZED);
    expect(err.kind).toBe('authorization');
    expect(err.messageKey).toBe('auth.actor_not_authorized');
  });

  it('initialPasswordChangeRequired retorna INITIAL_PASSWORD_CHANGE_REQUIRED', () => {
    const err = initialPasswordChangeRequired();
    expect(err.code).toBe(DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED);
    expect(err.kind).toBe('authorization');
    expect(err.messageKey).toBe('admin.initial_password_change_required');
  });

  it('provisionedResourceNotFound retorna RESOURCE_NOT_FOUND', () => {
    const err = provisionedResourceNotFound();
    expect(err.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(err.kind).toBe('not_found');
    expect(err.messageKey).toBe('identity.provisioned_resource_not_found');
  });

  it('idempotencyKeyReused retorna IDEMPOTENCY_KEY_REUSED', () => {
    const err = idempotencyKeyReused();
    expect(err.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(err.kind).toBe('conflict');
    expect(err.messageKey).toBe('idempotency.key_reused');
  });

  it('activationTokenInvalidOrExpired retorna ACTIVATION_TOKEN_INVALID_OR_EXPIRED', () => {
    const err = activationTokenInvalidOrExpired();
    expect(err.code).toBe(DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED);
    expect(err.kind).toBe('unprocessable');
    expect(err.messageKey).toBe('activation.token_invalid_or_expired');
  });

  it('passwordResetTokenInvalidOrExpired retorna PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED', () => {
    const err = passwordResetTokenInvalidOrExpired();
    expect(err.code).toBe(DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED);
    expect(err.kind).toBe('unprocessable');
    expect(err.messageKey).toBe('auth.password_reset_token_invalid_or_expired');
  });

  it('invalidCurrentPassword retorna CURRENT_PASSWORD_INVALID', () => {
    const err = invalidCurrentPassword();
    expect(err.code).toBe(DomainErrorCode.CURRENT_PASSWORD_INVALID);
    expect(err.kind).toBe('unprocessable');
    expect(err.messageKey).toBe('auth.invalid_current_password');
  });

  it('newPasswordTooShort retorna INVALID_DOMAIN_INPUT', () => {
    const err = newPasswordTooShort();
    expect(err.code).toBe(DomainErrorCode.INVALID_DOMAIN_INPUT);
    expect(err.kind).toBe('validation');
    expect(err.messageKey).toBe('auth.new_password_too_short');
  });

  it('idempotencyKeyReusedProfileUpdate retorna IDEMPOTENCY_KEY_REUSED', () => {
    const err = idempotencyKeyReusedProfileUpdate();
    expect(err.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(err.kind).toBe('conflict');
    expect(err.messageKey).toBe('idempotency.key_reused_profile_update');
  });

  it('idempotencyKeyReusedPasswordChange retorna IDEMPOTENCY_KEY_REUSED', () => {
    const err = idempotencyKeyReusedPasswordChange();
    expect(err.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(err.kind).toBe('conflict');
    expect(err.messageKey).toBe('idempotency.key_reused_password_change');
  });

  it('technicalFailure retorna TECHNICAL_DEPENDENCY_FAILURE', () => {
    const err = technicalFailure();
    expect(err.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(err.kind).toBe('technical');
    expect(err.messageKey).toBe('technical.dependency_failure');
  });

  it('ningún error contiene PII en messageKey', () => {
    const errors = [
      emailAlreadyRegistered(),
      invalidCredentials(),
      sessionNotFoundOrExpired(),
      authenticationRequired(),
      actorNotAuthorized(),
      initialPasswordChangeRequired(),
      provisionedResourceNotFound(),
      idempotencyKeyReused(),
      activationTokenInvalidOrExpired(),
      passwordResetTokenInvalidOrExpired(),
      invalidCurrentPassword(),
      newPasswordTooShort(),
      idempotencyKeyReusedProfileUpdate(),
      idempotencyKeyReusedPasswordChange(),
      technicalFailure(),
    ];
    for (const error of errors) {
      expect(error.messageKey).not.toMatch(/password_hash|secret|token.*abc/i);
    }
  });
});
