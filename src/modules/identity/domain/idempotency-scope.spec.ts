import { adminProvisionScope, ADMIN_PROVISION_SCOPE_PREFIX } from './idempotency-scope';

describe('idempotency-scope', () => {
  it('ADMIN_PROVISION_SCOPE_PREFIX tiene el valor correcto', () => {
    expect(ADMIN_PROVISION_SCOPE_PREFIX).toBe('admin-provision:');
  });

  it('adminProvisionScope construye el scope correctamente', () => {
    const scope = adminProvisionScope('actor-123');
    expect(scope).toBe('admin-provision:actor-123');
  });

  it('adminProvisionScope con actorId vacío', () => {
    const scope = adminProvisionScope('');
    expect(scope).toBe('admin-provision:');
  });
});
