import { InMemoryPaymentReconciliationMetricsAdapter } from './in-memory-payment-reconciliation-metrics.adapter';

/**
 * Tests del adapter in-memory de métricas de reconciliación (MSF-PAY-004).
 *
 * Cubre:
 * - Inicialización con contadores en 0
 * - Incremento de contadores
 * - Snapshot inmutable
 * - Acumulación correcta
 */
describe('InMemoryPaymentReconciliationMetricsAdapter', () => {
  let adapter: InMemoryPaymentReconciliationMetricsAdapter;

  beforeEach(() => {
    adapter = new InMemoryPaymentReconciliationMetricsAdapter();
  });

  describe('inicialización', () => {
    it('debe inicializar todos los contadores en 0', () => {
      const snapshot = adapter.snapshot();

      expect(snapshot.runCounts.completed).toBe(0);
      expect(snapshot.runCounts.failed).toBe(0);
      expect(snapshot.reconciledCount).toBe(0);
      expect(snapshot.expiredCount).toBe(0);
      expect(snapshot.refundCount).toBe(0);
      expect(snapshot.errorsCount).toBe(0);
      expect(snapshot.lastSuccessTimestamp).toBe(0);
    });
  });

  describe('incRun', () => {
    it('debe incrementar contador de runs exitosos', () => {
      adapter.incRun('completed');
      adapter.incRun('completed');

      expect(adapter.snapshot().runCounts.completed).toBe(2);
    });

    it('debe incrementar contador de runs fallidos', () => {
      adapter.incRun('failed');

      expect(adapter.snapshot().runCounts.failed).toBe(1);
    });
  });

  describe('incReconciled', () => {
    it('debe incrementar contador de reconciliaciones', () => {
      adapter.incReconciled();
      adapter.incReconciled();
      adapter.incReconciled();

      expect(adapter.snapshot().reconciledCount).toBe(3);
    });
  });

  describe('incExpired', () => {
    it('debe incrementar contador de expiraciones', () => {
      adapter.incExpired();

      expect(adapter.snapshot().expiredCount).toBe(1);
    });
  });

  describe('incRefund', () => {
    it('debe incrementar contador de refunds', () => {
      adapter.incRefund();
      adapter.incRefund();

      expect(adapter.snapshot().refundCount).toBe(2);
    });
  });

  describe('incError', () => {
    it('debe incrementar contador de errores', () => {
      adapter.incError();

      expect(adapter.snapshot().errorsCount).toBe(1);
    });
  });

  describe('setLastSuccessTimestamp', () => {
    it('debe actualizar el timestamp del último éxito', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      adapter.setLastSuccessTimestamp(timestamp);

      expect(adapter.snapshot().lastSuccessTimestamp).toBe(timestamp);
    });
  });

  describe('snapshot inmutabilidad', () => {
    it('no debe mutar el snapshot al modificar el adapter', () => {
      adapter.incReconciled();
      const snapshot1 = adapter.snapshot();

      adapter.incReconciled();
      const snapshot2 = adapter.snapshot();

      expect(snapshot1.reconciledCount).toBe(1);
      expect(snapshot2.reconciledCount).toBe(2);
    });

    it('no debe mutar el snapshot externamente', () => {
      adapter.incReconciled();
      const snapshot = adapter.snapshot();
      (snapshot as any).reconciledCount = 999;

      expect(adapter.snapshot().reconciledCount).toBe(1);
    });
  });
});
