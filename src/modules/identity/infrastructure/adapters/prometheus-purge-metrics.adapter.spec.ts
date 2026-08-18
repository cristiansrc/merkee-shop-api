import { Registry } from 'prom-client';
import {
  PrometheusPurgeMetricsAdapter,
  PURGE_METRIC_DELETED,
  PURGE_METRIC_ERRORS,
  PURGE_METRIC_LAST_SUCCESS,
  PURGE_METRIC_RUNS,
  PURGE_METRIC_SKIPPED,
} from './prometheus-purge-metrics.adapter';

describe('PrometheusPurgeMetricsAdapter', () => {
  let registry: Registry;
  let metrics: PrometheusPurgeMetricsAdapter;

  beforeEach(() => {
    registry = new Registry();
    metrics = new PrometheusPurgeMetricsAdapter(registry);
  });

  it('emite contadores y gauge con los nombres canónicos y valores exactos', async () => {
    const ts = new Date('2026-08-15T12:00:00.000Z');

    metrics.recordRun('success');
    metrics.recordRun('success');
    metrics.recordRun('error');
    metrics.recordDeleted(42);
    metrics.recordSkipped('operation_pending', 3);
    metrics.recordSkipped('replay_active', 4);
    metrics.recordError();
    metrics.recordLastSuccess(ts);

    const text = await registry.metrics();

    expect(text).toContain(`${PURGE_METRIC_RUNS}{outcome="success"} 2`);
    expect(text).toContain(`${PURGE_METRIC_RUNS}{outcome="error"} 1`);
    expect(text).toContain(`${PURGE_METRIC_DELETED} 42`);
    expect(text).toContain(`${PURGE_METRIC_SKIPPED}{reason="operation_pending"} 3`);
    expect(text).toContain(`${PURGE_METRIC_SKIPPED}{reason="replay_active"} 4`);
    expect(text).toContain(`${PURGE_METRIC_ERRORS} 1`);
    expect(text).toContain(
      `${PURGE_METRIC_LAST_SUCCESS} ${ts.getTime() / 1000}`,
    );
  });

  it('no emite PII: solo contadores y timestamps', async () => {
    metrics.recordRun('success');
    metrics.recordSkipped('operation_pending', 1);
    metrics.recordLastSuccess(new Date('2026-08-15T12:00:00.000Z'));

    const text = await registry.metrics();

    // Ningún dato personal: sin scope, claves, cuerpos, emails ni tokens.
    expect(text).not.toMatch(/scope|idempotency_key|body_hash|email|token/i);
  });

  it('registra los nombres canónicos en HELP/TYPE sin emitir datos hasta incrementar', async () => {
    const text = await registry.metrics();

    // Los contadores con labels no emiten líneas de datos hasta incrementarse,
    // pero los HELP/TYPE canónicos deben estar presentes.
    expect(text).toContain(`# HELP ${PURGE_METRIC_RUNS}`);
    expect(text).toContain(`# TYPE ${PURGE_METRIC_RUNS} counter`);
    expect(text).toContain(`# HELP ${PURGE_METRIC_DELETED}`);
    expect(text).toContain(`# TYPE ${PURGE_METRIC_DELETED} counter`);
    expect(text).toContain(`# HELP ${PURGE_METRIC_SKIPPED}`);
    expect(text).toContain(`# TYPE ${PURGE_METRIC_SKIPPED} counter`);
    expect(text).toContain(`# HELP ${PURGE_METRIC_ERRORS}`);
    expect(text).toContain(`# TYPE ${PURGE_METRIC_ERRORS} counter`);
    expect(text).toContain(`# HELP ${PURGE_METRIC_LAST_SUCCESS}`);
    expect(text).toContain(`# TYPE ${PURGE_METRIC_LAST_SUCCESS} gauge`);
  });
});
