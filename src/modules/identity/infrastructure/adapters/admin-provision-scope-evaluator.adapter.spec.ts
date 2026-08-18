import { AdminProvisionScopeEvaluatorAdapter } from './admin-provision-scope-evaluator.adapter';

describe('AdminProvisionScopeEvaluatorAdapter', () => {
  const adapter = new AdminProvisionScopeEvaluatorAdapter();
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('no tiene operación pendiente para admin-provision con UUID válido (terminal al confirmar)', async () => {
    await expect(
      adapter.hasPendingOperation(`admin-provision:${validUuid}`),
    ).resolves.toBe(false);
  });

  it('trata como pendiente (conservador) un UUID mal formado tras el prefijo', async () => {
    // No es un UUID: actor legible, UUID truncado, UUID con llaves, mayúsculas.
    await expect(
      adapter.hasPendingOperation('admin-provision:actor-1'),
    ).resolves.toBe(true);
    await expect(
      adapter.hasPendingOperation('admin-provision:123e4567'),
    ).resolves.toBe(true);
    await expect(
      adapter.hasPendingOperation(`admin-provision:{${validUuid}}`),
    ).resolves.toBe(true);
    await expect(
      adapter.hasPendingOperation('admin-provision:123E4567-E89B-12D3-A456-426614174000'),
    ).resolves.toBe(true);
  });

  it('trata como pendiente (conservador) un prefijo admin-provision sin actor', async () => {
    await expect(adapter.hasPendingOperation('admin-provision:')).resolves.toBe(
      true,
    );
  });

  it('trata como pendiente (conservador) cualquier scope desconocido', async () => {
    await expect(
      adapter.hasPendingOperation('some-other-scope:1'),
    ).resolves.toBe(true);
    await expect(adapter.hasPendingOperation('')).resolves.toBe(true);
  });
});
