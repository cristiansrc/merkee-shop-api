import {
  DEFAULT_PURGE_SCHEDULE_CONFIG,
  DEFAULT_PURGE_SCHEDULE_TIME,
  ScheduledIdempotencyPurgeAdapter,
} from './scheduled-idempotency-purge.adapter';
import { PurgeIdempotencyRecordsUseCase } from '../../application/use-cases/purge-idempotency-records.use-case';
import { ok, fail } from '../../../../shared/domain/result';
import { technicalFailure } from '../../domain/identity-errors';
import { PurgeMetricsPort } from '../../domain/ports/purge-metrics.port';
import { PurgeLoggerPort } from '../../domain/ports/purge-logger.port';

describe('ScheduledIdempotencyPurgeAdapter', () => {
  function stubUseCase(): PurgeIdempotencyRecordsUseCase {
    return {
      execute: jest.fn().mockResolvedValue(ok(undefined)),
    } as unknown as PurgeIdempotencyRecordsUseCase;
  }

  function stubMetrics(): PurgeMetricsPort {
    return {
      recordRun: jest.fn(),
      recordDeleted: jest.fn(),
      recordSkipped: jest.fn(),
      recordError: jest.fn(),
      recordLastSuccess: jest.fn(),
    };
  }

  function stubLogger(): PurgeLoggerPort {
    return { info: jest.fn(), error: jest.fn() };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no programa ningún job si está deshabilitado (tests)', () => {
    const execute = jest.fn();
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      { execute } as unknown as PurgeIdempotencyRecordsUseCase,
      {
        enabled: false,
        time: DEFAULT_PURGE_SCHEDULE_TIME,
      },
      stubMetrics(),
      stubLogger(),
    );

    adapter.onApplicationBootstrap();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(execute).not.toHaveBeenCalled();
  });

  it('programa la ejecución diaria a la hora configurada cuando está habilitado', () => {
    const execute = jest.fn().mockResolvedValue(ok(undefined));
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      { execute } as unknown as PurgeIdempotencyRecordsUseCase,
      { enabled: true, time: '02:00' },
      stubMetrics(),
      stubLogger(),
    );

    adapter.onApplicationBootstrap();

    // A las 00:00 UTC, faltan 2 h para las 02:00.
    jest.advanceTimersByTime(2 * 60 * 60 * 1000 - 1);
    expect(execute).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('start() es idempotente: no duplica jobs', () => {
    const execute = jest.fn().mockResolvedValue(ok(undefined));
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      { execute } as unknown as PurgeIdempotencyRecordsUseCase,
      { enabled: true, time: '02:00' },
      stubMetrics(),
      stubLogger(),
    );

    adapter.start();
    adapter.start();
    adapter.start();

    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('usa la hora por defecto 02:00 cuando no se provee configuración', () => {
    expect(DEFAULT_PURGE_SCHEDULE_CONFIG).toEqual({
      enabled: true,
      time: '02:00',
    });
    expect(DEFAULT_PURGE_SCHEDULE_TIME).toBe('02:00');
  });

  it('onApplicationShutdown limpia el timer pendiente', () => {
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      stubUseCase(),
      { enabled: true, time: '02:00' },
      stubMetrics(),
      stubLogger(),
    );
    adapter.start();

    adapter.onApplicationShutdown();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    // Sin timer activo, no se ejecuta nada tras el shutdown.
    expect(adapter['timer']).toBeNull();
  });

  it('run() propaga el Failure al log/metric sin filtrar causa/PII', async () => {
    const execute = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const metrics = stubMetrics();
    const logger = stubLogger();
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      { execute } as unknown as PurgeIdempotencyRecordsUseCase,
      { enabled: true, time: '02:00' },
      metrics,
      logger,
    );

    await adapter.run();

    expect(metrics.recordRun).toHaveBeenCalledWith('error');
    expect(metrics.recordError).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'idempotency_records.purge_failed',
      { code: 'TECHNICAL_DEPENDENCY_FAILURE' },
    );
  });

  it('run() no registra métricas de error en Success', async () => {
    const execute = jest.fn().mockResolvedValue(ok(undefined));
    const metrics = stubMetrics();
    const logger = stubLogger();
    const adapter = new ScheduledIdempotencyPurgeAdapter(
      { execute } as unknown as PurgeIdempotencyRecordsUseCase,
      { enabled: true, time: '02:00' },
      metrics,
      logger,
    );

    await adapter.run();

    expect(metrics.recordRun).not.toHaveBeenCalled();
    expect(metrics.recordError).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
