import { Argon2PasswordHasherAdapter } from './argon2-password-hasher.adapter';
import { isSuccess, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('Argon2PasswordHasherAdapter', () => {
  const adapter = new Argon2PasswordHasherAdapter();

  it('genera un hash Argon2id (prefijo $argon2id$) y verifica correctamente', async () => {
    const plain = 'external-secret';
    const hashResult = await adapter.hash(plain);

    expect(isSuccess(hashResult)).toBe(true);
    if (isSuccess(hashResult)) {
      expect(hashResult.value.startsWith('$argon2id$')).toBe(true);
      expect(hashResult.value).not.toContain(plain);
      const verifyResult = await adapter.verify(plain, hashResult.value);
      expect(isSuccess(verifyResult)).toBe(true);
      if (isSuccess(verifyResult)) expect(verifyResult.value).toBe(true);
    }
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hashResult = await adapter.hash('correct-secret');
    if (isSuccess(hashResult)) {
      const verifyResult = await adapter.verify('wrong-secret', hashResult.value);
      expect(isSuccess(verifyResult)).toBe(true);
      if (isSuccess(verifyResult)) expect(verifyResult.value).toBe(false);
    }
  });

  it('devuelve TECHNICAL_DEPENDENCY_FAILURE si el hash no es válido', async () => {
    const verifyResult = await adapter.verify('anything', 'not-a-valid-hash');
    expect(isFailure(verifyResult)).toBe(true);
    if (isFailure(verifyResult)) {
      expect(verifyResult.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
  });
});
