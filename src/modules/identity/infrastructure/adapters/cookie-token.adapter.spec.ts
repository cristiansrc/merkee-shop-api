import { CookieTokenAdapter } from './cookie-token.adapter';

describe('CookieTokenAdapter', () => {
  let adapter: CookieTokenAdapter;

  beforeEach(() => {
    adapter = new CookieTokenAdapter();
  });

  describe('generate', () => {
    it('genera token de 64 caracteres hex', () => {
      const token = adapter.generate();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it('genera tokens únicos', () => {
      const token1 = adapter.generate();
      const token2 = adapter.generate();
      expect(token1).not.toBe(token2);
    });
  });

  describe('hash', () => {
    it('hashea token con SHA-256', () => {
      const token = adapter.generate();
      const hash = adapter.hash(token);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('mismo token produce mismo hash', () => {
      const token = 'test-token';
      const hash1 = adapter.hash(token);
      const hash2 = adapter.hash(token);
      expect(hash1).toBe(hash2);
    });

    it('tokens diferentes producen hashes diferentes', () => {
      const hash1 = adapter.hash('token-1');
      const hash2 = adapter.hash('token-2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
