import { fail, isFailure, isSuccess, ok } from './result';
import { DomainError, domainError, DomainErrorCode } from './domain-error';

describe('Result (ROP)', () => {
  it('crea una rama Success con valor', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(isSuccess(result)).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('crea una rama Failure con DomainError', () => {
    const error: DomainError = domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not_found',
    );
    const result = fail<number, DomainError>(error);
    expect(result.ok).toBe(false);
    expect(isFailure(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('distingue correctamente Success de Failure', () => {
    const success = ok('ok');
    const failure = fail<string, DomainError>(
      domainError(DomainErrorCode.INVALID_DOMAIN_INPUT, 'validation', 'invalid.input'),
    );
    expect(isSuccess(success)).toBe(true);
    expect(isFailure(success)).toBe(false);
    expect(isSuccess(failure)).toBe(false);
    expect(isFailure(failure)).toBe(true);
  });
});
