import {
  EnvInitialAdminSecretAdapter,
  INITIAL_ADMIN_PASSWORD_ENV,
} from './env-initial-admin-secret.adapter';

describe('EnvInitialAdminSecretAdapter', () => {
  const adapter = new EnvInitialAdminSecretAdapter();

  afterEach(() => {
    delete process.env[INITIAL_ADMIN_PASSWORD_ENV];
  });

  it('devuelve null si la variable de entorno no está configurada', () => {
    delete process.env[INITIAL_ADMIN_PASSWORD_ENV];
    expect(adapter.getInitialAdminPassword()).toBeNull();
  });

  it('devuelve null si la variable está vacía o solo espacios', () => {
    process.env[INITIAL_ADMIN_PASSWORD_ENV] = '   ';
    expect(adapter.getInitialAdminPassword()).toBeNull();
  });

  it('devuelve el valor configurado', () => {
    process.env[INITIAL_ADMIN_PASSWORD_ENV] = 'external-secret';
    expect(adapter.getInitialAdminPassword()).toBe('external-secret');
  });
});
