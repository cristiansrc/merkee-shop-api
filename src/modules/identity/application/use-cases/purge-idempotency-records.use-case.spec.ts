import { PurgeIdempotencyRecordsUseCase } from './purge-idempotency-records.use-case';
import {
  IdempotencyPurgeRepositoryPort,
  PurgeBatchResult,
  PurgeCandidate,
  PurgeEvaluation,
} from '../../domain/ports/idempotency-purge-repository.port';
import { IdempotencyScopeEvaluatorPort } from '../../domain/ports/idempotency-scope-evaluator.port';
import { PurgeMetricsPort } from '../../domain/ports/purge-metrics.port';
import { PurgeLoggerPort } from '../../domain/ports/purge-logger.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

const now = new Date('2026-08-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * DAY);
}

function emptySkipped() {
  return {
    retention_not_elapsed: 0,
    minimum_age_not_elapsed: 0,
    replay_active: 0,
    operation_pending: 0,
  };
}

function stubRepo(
  overrides?: Partial<IdempotencyPurgeRepositoryPort>,
): IdempotencyPurgeRepositoryPort {
  return {
    purgeBatch: jest.fn().mockResolvedValue(
      ok({ deleted: 0, hasMore: false, skipped: emptySkipped() }),
    ),
    ...overrides,
  };
}

function stubScopeEvaluator(
  pending: boolean,
): IdempotencyScopeEvaluatorPort {
  return { hasPendingOperation: jest.fn().mockResolvedValue(pending) };
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

function stubClock(): ClockPort {
  return { now: jest.fn().mockReturnValue(now) };
}

function createUseCase(overrides: {
  repo?: Partial<IdempotencyPurgeRepositoryPort>;
  scopeEvaluator?: IdempotencyScopeEvaluatorPort;
  metrics?: PurgeMetricsPort;
  logger?: PurgeLoggerPort;
  sleepFn?: (ms: number) => Promise<void>;
}): {
  uc: PurgeIdempotencyRecordsUseCase;
  metrics: PurgeMetricsPort;
  logger: PurgeLoggerPort;
} {
  const metrics = overrides.metrics ?? stubMetrics();
  const logger = overrides.logger ?? stubLogger();
  const uc = new PurgeIdempotencyRecordsUseCase(
    stubRepo(overrides.repo),
    overrides.scopeEvaluator ?? stubScopeEvaluator(false),
    metrics,
    logger,
    stubClock(),
    overrides.sleepFn ?? (() => Promise.resolve()),
  );
  return { uc, metrics, logger };
}

/** Captura el callback `evaluate` que el caso de uso pasa al repositorio. */
function captureEvaluate(
  repo: Partial<IdempotencyPurgeRepositoryPort>,
): {
  evaluate: () => PurgeEvaluation;
  setResult: (r: ReturnType<typeof ok<PurgeBatchResult>>) => void;
} {
  let capturedEvaluate: PurgeEvaluation = async () => 'eligible';
  let result: ReturnType<typeof ok<PurgeBatchResult>> = ok({
    deleted: 0,
    hasMore: false,
    skipped: emptySkipped(),
  });
  repo.purgeBatch = jest.fn(async (_now, _minimumAgeCutoff, _limit, ev) => {
    capturedEvaluate = ev;
    return result;
  });
  return {
    evaluate: () => capturedEvaluate,
    setResult: (r) => {
      result = r;
    },
  };
}

/** Candidato mínimo para invocar el evaluador capturado. */
function candidate(overrides: {
  id?: string;
  scope?: string;
  createdAt?: Date;
  activationExpiresAt?: Date | null;
}): PurgeCandidate {
  return {
    id: overrides.id ?? 'r1',
    scope: overrides.scope ?? 'admin-provision:actor-1',
    createdAt: overrides.createdAt ?? daysAgo(31),
    activationExpiresAt: overrides.activationExpiresAt ?? null,
  };
}

describe('PurgeIdempotencyRecordsUseCase', () => {
  it('elimina registros con retención vencida (>30d), >24h y sin operación pendiente', async () => {
    const repo = stubRepo();
    const { evaluate, setResult } = captureEvaluate(repo);
    setResult(ok({ deleted: 1, hasMore: false, skipped: emptySkipped() }));
    const { uc, metrics, logger } = createUseCase({ repo });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(false);
    expect(repo.purgeBatch).toHaveBeenCalledTimes(1);
    expect(metrics.recordDeleted).toHaveBeenCalledWith(1);
    expect(metrics.recordRun).toHaveBeenCalledWith('success');
    expect(metrics.recordLastSuccess).toHaveBeenCalledWith(now);
    expect(logger.info).toHaveBeenCalledWith(
      'idempotency_records.purge_completed',
      { deleted: 1 },
    );
  });

  it('pasa a la selección el cutoff de 24 h como referencia del evaluador', async () => {
    const repo = stubRepo();
    const purgeBatch = jest.fn().mockResolvedValue(
      ok({ deleted: 0, hasMore: false, skipped: emptySkipped() }),
    );
    repo.purgeBatch = purgeBatch;
    const { uc } = createUseCase({ repo });

    await uc.execute();

    // El segundo argumento es el cutoff de 24 h (referencia del evaluador para
    // `minimum_age_not_elapsed`); la selección del adapter parte de `now` para
    // alcanzar también `replay_active` y eligible.
    const [, minimumAgeCutoff] = purgeBatch.mock.calls[0];
    expect(minimumAgeCutoff.getTime()).toBe(now.getTime() - DAY);
  });

  it('no elimina registros antes de 24 horas (minimum_age_not_elapsed)', async () => {
    // Un registro de 12 horas no se elimina: la protección mínima de 24 h lo
    // excluye (razón `minimum_age_not_elapsed`).
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({ repo });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(0.5) }),
    );
    expect(reason).toBe('minimum_age_not_elapsed');
  });

  it('no elimina registros con replay vigente (dentro de la ventana de 30 días)', async () => {
    // Replay vigente durante la ventana de retención (30 días): un registro de
    // 29 días sin expiración específica vencida no se elimina (razón
    // `replay_active`).
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({ repo });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(29), activationExpiresAt: daysAgo(-1) }),
    );
    expect(reason).toBe('replay_active');
  });

  it('clasifica como replay_active un registro dentro de 30 días sin expiración específica', async () => {
    // Sin `activation_expires_at` definido no hay expiración específica vencida:
    // dentro de la ventana de 30 días el replay sigue vigente.
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({ repo });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(29), activationExpiresAt: null }),
    );
    expect(reason).toBe('replay_active');
  });

  it('clasifica como retention_not_elapsed un registro dentro de 30 días con expiración específica vencida', async () => {
    // `retention_not_elapsed` es la razón general residual: sigue dentro de los
    // 30 días pero la expiración específica (`activation_expires_at`) ya venció,
    // por lo que el replay ya no es vigente. No crea una ventana ni conducta nueva.
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({ repo });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(29), activationExpiresAt: daysAgo(1) }),
    );
    expect(reason).toBe('retention_not_elapsed');
  });

  it('clasifica explícitamente como eligible un registro fuera de retención, sin replay y con scope terminal', async () => {
    // `eligible` es una clasificación explícita separada de las razones de skip:
    // >30 días, sin replay vigente y scope terminal (admin-provision con UUID).
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({ repo });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(31), activationExpiresAt: daysAgo(1) }),
    );
    expect(reason).toBe('eligible');
  });

  it('registra replay_active como skip cuando el batch lo reporta', async () => {
    const repo = stubRepo();
    const { setResult } = captureEvaluate(repo);
    setResult(
      ok({
        deleted: 0,
        hasMore: false,
        skipped: {
          retention_not_elapsed: 0,
          minimum_age_not_elapsed: 0,
          replay_active: 4,
          operation_pending: 0,
        },
      }),
    );
    const { uc, metrics } = createUseCase({ repo });

    await uc.execute();

    expect(metrics.recordSkipped).toHaveBeenCalledWith('replay_active', 4);
    expect(metrics.recordDeleted).not.toHaveBeenCalled();
  });

  it('no elimina registros cuyo scope tiene operación pendiente (operation_pending)', async () => {
    const repo = stubRepo();
    const { evaluate } = captureEvaluate(repo);
    const { uc } = createUseCase({
      repo,
      scopeEvaluator: stubScopeEvaluator(true),
    });

    await uc.execute();

    const reason = await evaluate()(
      candidate({ createdAt: daysAgo(31) }),
    );
    expect(reason).toBe('operation_pending');
  });

  it('registra métricas de skip tras el commit de forma consistente', async () => {
    const repo = stubRepo();
    const { setResult } = captureEvaluate(repo);
    setResult(
      ok({
        deleted: 0,
        hasMore: false,
        skipped: {
          retention_not_elapsed: 0,
          minimum_age_not_elapsed: 0,
          replay_active: 0,
          operation_pending: 3,
        },
      }),
    );
    const { uc, metrics } = createUseCase({ repo });

    await uc.execute();

    expect(metrics.recordSkipped).toHaveBeenCalledWith('operation_pending', 3);
    expect(metrics.recordDeleted).not.toHaveBeenCalled();
  });

  it('procesa varios batches hasta agotar los candidatos', async () => {
    const repo = stubRepo();
    const purgeBatch = jest
      .fn()
      .mockResolvedValueOnce(
        ok({ deleted: 500, hasMore: true, skipped: emptySkipped() }),
      )
      .mockResolvedValueOnce(
        ok({ deleted: 1, hasMore: false, skipped: emptySkipped() }),
      );
    repo.purgeBatch = purgeBatch;
    const { uc, metrics } = createUseCase({ repo });

    await uc.execute();

    expect(purgeBatch).toHaveBeenCalledTimes(2);
    expect(metrics.recordDeleted).toHaveBeenCalledTimes(2);
    expect(metrics.recordRun).toHaveBeenCalledWith('success');
  });

  it('detiene el bucle si un batch completo se salta (evita bucle infinito)', async () => {
    const repo = stubRepo();
    const purgeBatch = jest.fn().mockResolvedValue(
      ok({
        deleted: 0,
        hasMore: true,
        skipped: { ...emptySkipped(), operation_pending: 500 },
      }),
    );
    repo.purgeBatch = purgeBatch;
    const { uc, metrics } = createUseCase({
      repo,
      scopeEvaluator: stubScopeEvaluator(true),
    });

    await uc.execute();

    // Un solo batch: no se elimina nada y no se vuelve a consultar en bucle.
    expect(purgeBatch).toHaveBeenCalledTimes(1);
    expect(metrics.recordDeleted).not.toHaveBeenCalled();
    expect(metrics.recordRun).toHaveBeenCalledWith('success');
  });

  it('propaga Failure técnico del adapter sin métricas de error en application', async () => {
    // El adapter traduce las excepciones técnicas a `fail(technicalFailure())`
    // en su límite; la aplicación no captura excepciones técnicas, propaga el
    // `Failure` y NO registra por sí misma `recordRun('error')` ni
    // `recordError` (eso es responsabilidad del driving scheduler).
    const repo = stubRepo({
      purgeBatch: jest.fn().mockResolvedValue(fail(technicalFailure())),
    });
    const { uc, metrics, logger } = createUseCase({ repo });

    const result = await uc.execute();

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
      expect(result.error.metadata).toBeUndefined();
    }
    expect(metrics.recordRun).not.toHaveBeenCalled();
    expect(metrics.recordError).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reintenta el batch ante Failure técnico transitorio y completa en el reintento', async () => {
    const repo = stubRepo();
    const purgeBatch = jest
      .fn()
      .mockResolvedValueOnce(fail(technicalFailure()))
      .mockResolvedValueOnce(
        ok({ deleted: 1, hasMore: false, skipped: emptySkipped() }),
      );
    repo.purgeBatch = purgeBatch;
    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const { uc, metrics } = createUseCase({ repo, sleepFn });

    await uc.execute();

    expect(sleepFn).toHaveBeenCalled();
    expect(purgeBatch).toHaveBeenCalledTimes(2);
    expect(metrics.recordDeleted).toHaveBeenCalledWith(1);
    expect(metrics.recordRun).toHaveBeenCalledWith('success');
  });

  it('usa el sleep por defecto (setTimeout) cuando no se inyecta sleepFn', async () => {
    jest.useFakeTimers();
    try {
      const repo = stubRepo();
      const purgeBatch = jest
        .fn()
        .mockResolvedValueOnce(fail(technicalFailure()))
        .mockResolvedValueOnce(
          ok({ deleted: 1, hasMore: false, skipped: emptySkipped() }),
        );
      repo.purgeBatch = purgeBatch;
      const metrics = stubMetrics();
      const logger = stubLogger();
      // Sin 6º argumento: se usa `defaultSleep` (setTimeout real) para el
      // reintento de 1 s del primer batch fallido.
      const uc = new PurgeIdempotencyRecordsUseCase(
        repo,
        stubScopeEvaluator(false),
        metrics,
        logger,
        stubClock(),
      );

      const promise = uc.execute();
      await jest.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(isFailure(result)).toBe(false);
      expect(purgeBatch).toHaveBeenCalledTimes(2);
      expect(metrics.recordDeleted).toHaveBeenCalledWith(1);
      expect(metrics.recordRun).toHaveBeenCalledWith('success');
    } finally {
      jest.useRealTimers();
    }
  });

  it('no contiene try/catch técnico en application (verificación estática)', () => {
    // ROP (Master Spec §ROP / ADR-017): la capa `application` no captura
    // excepciones técnicas; la traducción ocurre en el adapter.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'purge-idempotency-records.use-case.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/try\s*\{/);
    expect(source).not.toMatch(/catch\s*\(/);
  });
});
