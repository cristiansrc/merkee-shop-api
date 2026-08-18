import * as jwt from 'jsonwebtoken';
import { JwtAdapter } from './jwt.adapter';
import { isFailure, ok, fail, isSuccess } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

const VALID_SECRET = '12345678901234567890123456789012';

describe('JwtAdapter', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    jest.restoreAllMocks();
  });

  it('falla al arrancar en producción sin JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    expect(() => new JwtAdapter()).toThrow(
      'JWT_SECRET must be configured with at least 32 bytes in production.',
    );
  });

  it('falla al arrancar en producción con un secreto de 31 bytes', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '1234567890123456789012345678901';

    expect(() => new JwtAdapter()).toThrow(
      'JWT_SECRET must be configured with at least 32 bytes in production.',
    );
  });

  it('acepta exactamente 32 bytes en producción', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = VALID_SECRET;

    expect(() => new JwtAdapter()).not.toThrow();
  });

  it('permite el default únicamente en desarrollo y lo advierte sin exponerlo', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const warning = jest.spyOn(console, 'warn').mockImplementation();

    new JwtAdapter();

    expect(warning).toHaveBeenCalledWith(
      'JWT_SECRET no configurado; usando únicamente el valor por defecto de desarrollo.',
    );
    expect(warning.mock.calls.join(' ')).not.toContain('merkee-shop-dev-secret');
  });

  it.each([
    ['token inválido', 'not-a-jwt'],
    ['token expirado', jwt.sign({ sub: 'u1' }, VALID_SECRET, { expiresIn: -1 })],
    ['token no válido aún', jwt.sign({ sub: 'u1' }, VALID_SECRET, { notBefore: 60 })],
  ])('traduce %s a AUTHENTICATION_REQUIRED', async (_label, token) => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = VALID_SECRET;
    const result = await new JwtAdapter().verify(token);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
      expect(result.error.metadata).toBeUndefined();
    }
  });

  it('traduce errores inesperados a TECHNICAL_DEPENDENCY_FAILURE sin causa', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = VALID_SECRET;
    const adapter = new JwtAdapter();
    Object.defineProperty(adapter, 'secret', {
      get: () => {
        throw new Error('secret or token PII');
      },
    });
    const result = await adapter.verify('token');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
      expect(JSON.stringify(result)).not.toContain('secret or token PII');
    }
  });

  it('devuelve Success con un payload válido', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = VALID_SECRET;
    const adapter = new JwtAdapter();
    const signResult = await adapter.sign({
      sub: 'u1',
      session_id: 's1',
      role: 'admin',
    });
    expect(isSuccess(signResult)).toBe(true);
    if (!isSuccess(signResult)) return;

    const result = await adapter.verify(signResult.value);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) expect(result.value).toEqual({
      sub: 'u1',
      session_id: 's1',
      role: 'admin',
    });
  });
});
