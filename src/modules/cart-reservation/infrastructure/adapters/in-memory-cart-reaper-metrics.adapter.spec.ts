import { InMemoryCartReaperMetricsAdapter } from './in-memory-cart-reaper-metrics.adapter';

describe('InMemoryCartReaperMetricsAdapter', () => {
  let adapter: InMemoryCartReaperMetricsAdapter;

  beforeEach(() => {
    adapter = new InMemoryCartReaperMetricsAdapter();
  });

  it('inicia con contadores en cero', () => {
    const snapshot = adapter.snapshot();
    expect(snapshot.processedCounts.released).toBe(0);
    expect(snapshot.processedCounts.skipped).toBe(0);
    expect(snapshot.processedCounts.error).toBe(0);
    expect(snapshot.releasedCount).toBe(0);
    expect(snapshot.lagObservations).toEqual([]);
    expect(snapshot.activeCount).toBe(0);
  });

  it('incrementa el contador de procesados', () => {
    adapter.incProcessed('released');
    adapter.incProcessed('released');
    adapter.incProcessed('skipped');

    const snapshot = adapter.snapshot();
    expect(snapshot.processedCounts.released).toBe(2);
    expect(snapshot.processedCounts.skipped).toBe(1);
    expect(snapshot.processedCounts.error).toBe(0);
  });

  it('incrementa el contador de liberados', () => {
    adapter.incReleased();
    adapter.incReleased();
    adapter.incReleased();

    const snapshot = adapter.snapshot();
    expect(snapshot.releasedCount).toBe(3);
  });

  it('observa el lag de expiración', () => {
    adapter.observeExpiredLag(30);
    adapter.observeExpiredLag(120);

    const snapshot = adapter.snapshot();
    expect(snapshot.lagObservations).toEqual([30, 120]);
  });

  it('actualiza el gauge de reservas activas', () => {
    adapter.setActiveCount(42);
    expect(adapter.snapshot().activeCount).toBe(42);

    adapter.setActiveCount(0);
    expect(adapter.snapshot().activeCount).toBe(0);
  });

  it('snapshot devuelve copia inmutable', () => {
    adapter.incProcessed('released');
    adapter.incReleased();

    const snapshot1 = adapter.snapshot();
    const snapshot2 = adapter.snapshot();

    expect(snapshot1).toEqual(snapshot2);
    expect(snapshot1).not.toBe(snapshot2);
    expect(snapshot1.processedCounts).not.toBe(snapshot2.processedCounts);
  });
});
