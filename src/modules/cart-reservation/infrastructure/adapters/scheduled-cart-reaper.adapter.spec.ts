import { ScheduledCartReaperAdapter } from './scheduled-cart-reaper.adapter';

describe('ScheduledCartReaperAdapter', () => {
  const mockExpireUseCase = {
    execute: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no ejecuta el reaper cuando está deshabilitado', () => {
    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: false,
      intervalMs: 60_000,
    });

    adapter.start();

    expect(mockExpireUseCase.execute).not.toHaveBeenCalled();
    adapter.stop();
  });

  it('ejecuta el reaper después del intervalo configurado', async () => {
    mockExpireUseCase.execute.mockResolvedValue({
      ok: true,
      value: { released: 5, selected: 10, skippedTerminal: 5 },
    });

    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: true,
      intervalMs: 60_000,
    });

    adapter.start();

    // Avanzar el tiempo para que se ejecute el reaper
    await jest.advanceTimersByTimeAsync(60_000);

    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(1);

    adapter.stop();
  });

  it('ejecuta múltiples veces con el intervalo configurado', async () => {
    mockExpireUseCase.execute.mockResolvedValue({
      ok: true,
      value: { released: 0, selected: 0, skippedTerminal: 0 },
    });

    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: true,
      intervalMs: 60_000,
    });

    adapter.start();

    // Avanzar el tiempo para 3 ejecuciones
    await jest.advanceTimersByTimeAsync(60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(3);

    adapter.stop();
  });

  it('detiene limpiamente el scheduler', async () => {
    mockExpireUseCase.execute.mockResolvedValue({
      ok: true,
      value: { released: 0, selected: 0, skippedTerminal: 0 },
    });

    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: true,
      intervalMs: 60_000,
    });

    adapter.start();
    await jest.advanceTimersByTimeAsync(30_000); // Mitad del intervalo

    adapter.stop();
    await jest.advanceTimersByTimeAsync(60_000); // Pasar el intervalo

    // Solo debería haber ejecutado una vez (antes del stop)
    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(0);

    adapter.stop();
  });

  it('start() es idempotente', async () => {
    mockExpireUseCase.execute.mockResolvedValue({
      ok: true,
      value: { released: 0, selected: 0, skippedTerminal: 0 },
    });

    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: true,
      intervalMs: 60_000,
    });

    adapter.start();
    adapter.start(); // Segunda llamada no debería duplicar

    await jest.advanceTimersByTimeAsync(60_000);

    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(1);

    adapter.stop();
  });

  it('maneja errores del caso de uso sin detener el scheduler', async () => {
    mockExpireUseCase.execute
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({
        ok: true,
        value: { released: 5, selected: 10, skippedTerminal: 5 },
      });

    const adapter = new ScheduledCartReaperAdapter(mockExpireUseCase as any, {
      enabled: true,
      intervalMs: 60_000,
    });

    adapter.start();

    // Primera ejecución falla
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(1);

    // Segunda ejecución tiene éxito
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockExpireUseCase.execute).toHaveBeenCalledTimes(2);

    adapter.stop();
  });
});
