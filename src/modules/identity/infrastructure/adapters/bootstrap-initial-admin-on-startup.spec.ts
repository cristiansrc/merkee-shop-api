import { Logger } from '@nestjs/common';
import {
  BootstrapInitialAdminOnStartup,
  BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV,
} from './bootstrap-initial-admin-on-startup';
import { BootstrapInitialAdminUseCase } from '../../application/use-cases/bootstrap-initial-admin.use-case';
import { ok, fail } from '../../../../shared/domain/result';
import { technicalFailure } from '../../domain/identity-errors';

describe('BootstrapInitialAdminOnStartup', () => {
  const SECRET = 'super-secret-value';

  function stubUseCase(overrides?: {
    execute?: jest.Mock;
  }): BootstrapInitialAdminUseCase {
    return {
      execute: jest.fn().mockResolvedValue(ok({ outcome: 'created' })),
      ...overrides,
    } as unknown as BootstrapInitialAdminUseCase;
  }

  function createHook(useCase: BootstrapInitialAdminUseCase): BootstrapInitialAdminOnStartup {
    return new BootstrapInitialAdminOnStartup(useCase);
  }

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    delete process.env[BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV];
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    delete process.env[BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV];
  });

  it('no ejecuta el bootstrap si está deshabilitado explícitamente', async () => {
    process.env[BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV] = 'false';
    const execute = jest.fn();
    const hook = createHook(stubUseCase({ execute }));

    await hook.onApplicationBootstrap();

    expect(execute).not.toHaveBeenCalled();
  });

  it('ejecuta el bootstrap y registra el outcome sin PII cuando está habilitado', async () => {
    const execute = jest.fn().mockResolvedValue(ok({ outcome: 'created' }));
    const hook = createHook(stubUseCase({ execute }));

    await hook.onApplicationBootstrap();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('initial admin bootstrap created');
    // Ningún log contiene el secreto.
    const allLogs = logSpy.mock.calls.flat().join(' ') + warnSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain(SECRET);
  });

  it('registra advertencia sin PII y NO lanza si el bootstrap falla', async () => {
    const execute = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const hook = createHook(stubUseCase({ execute }));

    await expect(hook.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('initial admin bootstrap skipped'),
    );
    const allLogs = logSpy.mock.calls.flat().join(' ') + warnSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain(SECRET);
  });

  it('no lanza ni registra detalles crudos si el bootstrap lanza una excepción', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('connection refused'));
    const hook = createHook(stubUseCase({ execute }));

    await expect(hook.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith('initial admin bootstrap failed');
    const allLogs = logSpy.mock.calls.flat().join(' ') + warnSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain('connection refused');
    expect(allLogs).not.toContain(SECRET);
  });
});
