import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  describe('GET /health', () => {
    it('devuelve status ok', () => {
      const result = controller.check();
      expect(result.status).toBe('ok');
    });

    it('devuelve timestamp ISO válido', () => {
      const result = controller.check();
      const parsed = new Date(result.timestamp);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });

    it('timestamp es reciente (dentro de 5s)', () => {
      const before = Date.now();
      const result = controller.check();
      const after = Date.now();
      const ts = new Date(result.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before - 1000);
      expect(ts).toBeLessThanOrEqual(after + 1000);
    });

    it('no expone secretos ni variables de entorno', () => {
      const result = controller.check();
      const json = JSON.stringify(result);
      expect(json).not.toMatch(/DATABASE_URL/i);
      expect(json).not.toMatch(/SECRET/i);
      expect(json).not.toMatch(/PASSWORD/i);
      expect(json).not.toMatch(/TOKEN/i);
      expect(json).not.toMatch(/API_KEY/i);
    });

    it('respuesta tiene exactamente status y timestamp', () => {
      const result = controller.check();
      const keys = Object.keys(result);
      expect(keys).toEqual(expect.arrayContaining(['status', 'timestamp']));
      expect(keys.length).toBe(2);
    });
  });
});
