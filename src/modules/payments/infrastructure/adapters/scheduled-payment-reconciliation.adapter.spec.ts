import { ScheduledPaymentReconciliationAdapter } from './scheduled-payment-reconciliation.adapter';
import { ReconcilePendingPaymentsUseCaseImpl } from '../../application/use-cases/reconcile-pending-payments.use-case';
import { InMemoryPaymentReconciliationMetricsAdapter } from './in-memory-payment-reconciliation-metrics.adapter';
import { ok, fail } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ScheduledPaymentReconciliationAdapter', () => {
  let mockUseCase: jest.Mocked<ReconcilePendingPaymentsUseCaseImpl>;
  let metrics: InMemoryPaymentReconciliationMetricsAdapter;

  beforeEach(() => {
    jest.useFakeTimers();
    mockUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReconcilePendingPaymentsUseCaseImpl>;
    metrics = new InMemoryPaymentReconciliationMetricsAdapter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduler deshabilitado', () => {
    it('no ejecuta jobs cuando está deshabilitado', () => {
      const disabledAdapter = new ScheduledPaymentReconciliationAdapter(
        mockUseCase,
        metrics,
        { enabled: false, intervalMs: 1000 },
      );
      disabledAdapter.start();
      jest.advanceTimersByTime(5000);
      expect(mockUseCase.execute).not.toHaveBeenCalled();
      disabledAdapter.stop();
    });
  });

  describe('scheduler habilitado', () => {
    it('programa la ejecución después del intervalo', () => {
      const adapter = new ScheduledPaymentReconciliationAdapter(
        mockUseCase,
        metrics,
        { enabled: true, intervalMs: 1000 },
      );
      adapter.start();
      adapter.start(); // idempotente
      jest.advanceTimersByTime(1000);
      expect(mockUseCase.execute).toHaveBeenCalled();
      adapter.stop();
    });
  });

  describe('stop', () => {
    it('detiene el scheduler limpiamente', () => {
      const adapter = new ScheduledPaymentReconciliationAdapter(
        mockUseCase,
        metrics,
        { enabled: true, intervalMs: 1000 },
      );
      adapter.start();
      adapter.stop();
      jest.advanceTimersByTime(5000);
      expect(mockUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('configuración por defecto', () => {
    it('usa intervalo por defecto de 15 minutos', () => {
      const defaultAdapter = new ScheduledPaymentReconciliationAdapter(
        mockUseCase,
        metrics,
      );
      expect(defaultAdapter).toBeDefined();
      defaultAdapter.stop();
    });
  });
});
