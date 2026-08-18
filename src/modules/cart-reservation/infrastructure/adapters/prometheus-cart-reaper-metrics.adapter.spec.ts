import { PrometheusCartReaperMetricsAdapter } from './prometheus-cart-reaper-metrics.adapter';

describe('PrometheusCartReaperMetricsAdapter', () => {
  let adapter: PrometheusCartReaperMetricsAdapter;

  beforeEach(() => {
    PrometheusCartReaperMetricsAdapter.clearMetrics();
    adapter = new PrometheusCartReaperMetricsAdapter();
  });

  it('incrementa el contador de procesados con el outcome correcto', () => {
    // No debe lanzar errores
    adapter.incProcessed('released');
    adapter.incProcessed('skipped');
    adapter.incProcessed('error');
  });

  it('incrementa el contador de liberados', () => {
    // No debe lanzar errores
    adapter.incReleased();
    adapter.incReleased();
  });

  it('observa el lag de expiración', () => {
    // No debe lanzar errores
    adapter.observeExpiredLag(30);
    adapter.observeExpiredLag(120);
  });

  it('actualiza el gauge de reservas activas', () => {
    // No debe lanzar errores
    adapter.setActiveCount(42);
    adapter.setActiveCount(0);
  });
});
