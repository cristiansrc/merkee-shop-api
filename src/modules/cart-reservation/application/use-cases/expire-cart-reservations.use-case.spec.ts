import { ExpireCartReservationsUseCase } from './expire-cart-reservations.use-case';
import { isSuccess, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ExpireCartReservationsUseCase', () => {
  const mockReaper = {
    expireBatch: jest.fn(),
  };
  const mockMetrics = {
    incProcessed: jest.fn(),
    incReleased: jest.fn(),
    observeExpiredLag: jest.fn(),
    setActiveCount: jest.fn(),
  };
  const mockClock = {
    now: jest.fn(),
  };

  let useCase: ExpireCartReservationsUseCase;
  const fixedNow = new Date('2026-08-17T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockClock.now.mockReturnValue(fixedNow);
    useCase = new ExpireCartReservationsUseCase(
      mockReaper as any,
      mockMetrics as any,
      mockClock as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('devuelve success cuando libera reservas exitosamente', async () => {
    mockReaper.expireBatch.mockResolvedValue({
      selected: 10,
      released: 8,
      skippedTerminal: 2,
    });

    const result = await useCase.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.released).toBe(8);
      expect(result.value.selected).toBe(10);
      expect(result.value.skippedTerminal).toBe(2);
    }
    expect(mockReaper.expireBatch).toHaveBeenCalledWith(fixedNow, 500);
    expect(mockMetrics.incProcessed).toHaveBeenCalledWith('released');
    expect(mockMetrics.incReleased).toHaveBeenCalledTimes(8);
  });

  it('devuelve success con released=0 cuando no hay reservas expiradas', async () => {
    mockReaper.expireBatch.mockResolvedValue({
      selected: 0,
      released: 0,
      skippedTerminal: 0,
    });

    const result = await useCase.execute();

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.released).toBe(0);
    }
    expect(mockMetrics.incReleased).not.toHaveBeenCalled();
  });

  it('emite métricas de skipped cuando reserva ya está en estado terminal', async () => {
    mockReaper.expireBatch.mockResolvedValue({
      selected: 5,
      released: 3,
      skippedTerminal: 2,
    });

    const result = await useCase.execute();

    expect(isSuccess(result)).toBe(true);
    expect(mockMetrics.incProcessed).toHaveBeenCalledWith('skipped');
    expect(mockMetrics.incProcessed).toHaveBeenCalledTimes(3); // 1 released + 2 skipped
  });

  it('reintenta hasta 3 veces ante fallo del batch', async () => {
    mockReaper.expireBatch
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({
        selected: 5,
        released: 5,
        skippedTerminal: 0,
      });

    const resultPromise = useCase.execute();

    // Avanzar los timers para los reintentos (1s y 5s)
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;

    expect(isSuccess(result)).toBe(true);
    expect(mockReaper.expireBatch).toHaveBeenCalledTimes(3);
    expect(mockMetrics.incProcessed).toHaveBeenCalledWith('error');
  });

 it('devuelve failure tras agotar los 3 reintentos', async () => {
    mockReaper.expireBatch
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockRejectedValueOnce(new Error('DB timeout'));

    const resultPromise = useCase.execute();

    // Avanzar timers para los 3 reintentos
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15000);

    const result = await resultPromise;

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
    }
    expect(mockReaper.expireBatch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('no emite métricas de released cuando released=0', async () => {
    mockReaper.expireBatch.mockResolvedValue({
      selected: 3,
      released: 0,
      skippedTerminal: 3,
    });

    const result = await useCase.execute();

    expect(isSuccess(result)).toBe(true);
    expect(mockMetrics.incReleased).not.toHaveBeenCalled();
  });
});
