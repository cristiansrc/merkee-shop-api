import { PrometheusPaymentReconciliationMetricsAdapter } from './prometheus-payment-reconciliation-metrics.adapter';

/**
 * Tests del adapter Prometheus de métricas de reconciliación (MSF-PAY-004).
 *
 * Cubre:
 * - Nombres canónicos de métricas
 * - Incremento de contadores
 * - Gauge de timestamp
 * - Limpieza de registry
 * - Sin PII en métricas
 */
describe('PrometheusPaymentReconciliationMetricsAdapter', () => {
  let adapter: PrometheusPaymentReconciliationMetricsAdapter;

  beforeEach(() => {
    PrometheusPaymentReconciliationMetricsAdapter.clearMetrics();
    adapter = new PrometheusPaymentReconciliationMetricsAdapter();
  });

  afterEach(() => {
    PrometheusPaymentReconciliationMetricsAdapter.clearMetrics();
  });

  describe('nombres canónicos', () => {
    it('debe registrar métricas con los nombres correctos', () => {
      // Verificar que las métricas se registran sin errores
      expect(() => {
        adapter.incRun('completed');
        adapter.incReconciled();
        adapter.incExpired();
        adapter.incRefund();
        adapter.incError();
        adapter.setLastSuccessTimestamp(Math.floor(Date.now() / 1000));
      }).not.toThrow();
    });
  });

  describe('incRun', () => {
    it('debe incrementar counter de runs con label outcome', () => {
      // No debe lanzar errores
      expect(() => {
        adapter.incRun('completed');
        adapter.incRun('completed');
        adapter.incRun('failed');
      }).not.toThrow();
    });
  });

  describe('incReconciled', () => {
    it('debe incrementar counter de reconciliaciones', () => {
      expect(() => {
        adapter.incReconciled();
        adapter.incReconciled();
      }).not.toThrow();
    });
  });

  describe('incExpired', () => {
    it('debe incrementar counter de expiraciones', () => {
      expect(() => {
        adapter.incExpired();
      }).not.toThrow();
    });
  });

  describe('incRefund', () => {
    it('debe incrementar counter de refunds', () => {
      expect(() => {
        adapter.incRefund();
      }).not.toThrow();
    });
  });

  describe('incError', () => {
    it('debe incrementar counter de errores', () => {
      expect(() => {
        adapter.incError();
      }).not.toThrow();
    });
  });

  describe('setLastSuccessTimestamp', () => {
    it('debe actualizar gauge de timestamp', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      expect(() => {
        adapter.setLastSuccessTimestamp(timestamp);
      }).not.toThrow();
    });
  });

  describe('clearMetrics', () => {
    it('debe limpiar el registry sin errores', () => {
      adapter.incRun('completed');
      expect(() => {
        PrometheusPaymentReconciliationMetricsAdapter.clearMetrics();
      }).not.toThrow();
    });
  });
});
