import { InMemoryPurgeMetricsAdapter } from './in-memory-purge-metrics.adapter';

describe('InMemoryPurgeMetricsAdapter', () => {
  it('acumula runs, deleted, skipped, errors y last_success sin PII', () => {
    const metrics = new InMemoryPurgeMetricsAdapter();
    const ts = new Date('2026-08-15T12:00:00.000Z');

    metrics.recordRun('success');
    metrics.recordRun('success');
    metrics.recordRun('error');
    metrics.recordDeleted(42);
    metrics.recordSkipped('operation_pending', 3);
    metrics.recordSkipped('retention_not_elapsed', 1);
    metrics.recordError();
    metrics.recordLastSuccess(ts);

    const snap = metrics.snapshot();
    expect(snap.runs).toEqual({ success: 2, error: 1 });
    expect(snap.deleted).toBe(42);
    expect(snap.skipped.operation_pending).toBe(3);
    expect(snap.skipped.retention_not_elapsed).toBe(1);
    expect(snap.errors).toBe(1);
    expect(snap.lastSuccess).toEqual(ts);
  });

  it('devuelve un snapshot inmutable (no muta el estado interno)', () => {
    const metrics = new InMemoryPurgeMetricsAdapter();
    metrics.recordDeleted(5);

    const snap = metrics.snapshot();
    (snap as { deleted: number }).deleted = 999;
    (snap.skipped as Record<string, number>).operation_pending = 999;

    expect(metrics.snapshot().deleted).toBe(5);
    expect(metrics.snapshot().skipped.operation_pending).toBe(0);
  });

  it('inicializa todos los contadores a cero y last_success a null', () => {
    const metrics = new InMemoryPurgeMetricsAdapter();
    const snap = metrics.snapshot();

    expect(snap.runs).toEqual({ success: 0, error: 0 });
    expect(snap.deleted).toBe(0);
    expect(snap.skipped).toEqual({
      retention_not_elapsed: 0,
      minimum_age_not_elapsed: 0,
      replay_active: 0,
      operation_pending: 0,
    });
    expect(snap.errors).toBe(0);
    expect(snap.lastSuccess).toBeNull();
  });
});
