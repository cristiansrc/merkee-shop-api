import { SystemClockAdapter } from './system-clock.adapter';

describe('SystemClockAdapter', () => {
  let adapter: SystemClockAdapter;

  beforeEach(() => {
    adapter = new SystemClockAdapter();
  });

  describe('now', () => {
    it('retorna una instancia de Date', () => {
      const result = adapter.now();
      expect(result).toBeInstanceOf(Date);
    });

    it('retorna la hora actual (dentro de un rango razonable)', () => {
      const before = new Date();
      const result = adapter.now();
      const after = new Date();
      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
