/**
 * Tests para la configuración CORS del monolito Merkee Shop.
 *
 * Valida:
 *  - Allowlist de origins permitidos (producción conocida)
 *  - Rechazo de origins no permitidos
 *  - Requests sin Origin (Same-Origin, server-to-server)
 *  - Configuración de headers, methods y credentials
 *  - Funcionamiento con variable de entorno CORS_ALLOWED_ORIGINS
 */

import { originCallback, corsOptions } from './cors.config';

describe('CORS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('originCallback', () => {
    describe('producción conocida', () => {
      it('permite https://www.merkee.shop', (done) => {
        originCallback('https://www.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });

      it('permite https://admin.merkee.shop', (done) => {
        originCallback('https://admin.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });
    });

    describe('rechazo de origins no permitidos', () => {
      it('rechaza origin arbitrario malicioso', (done) => {
        originCallback('https://evil.example.com', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });

      it('rechaza origin con path', (done) => {
        originCallback('https://www.merkee.shop/../../etc', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });

      it('rechaza origin con puerto no estándar', (done) => {
        originCallback('https://www.merkee.shop:8443', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });

      it('rechaza origin HTTP (no HTTPS)', (done) => {
        originCallback('http://www.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });

      it('rechaza subdominio no autorizado', (done) => {
        originCallback('https://api.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });
    });

    describe('requests sin Origin', () => {
      it('permite request sin origin (Same-Origin)', (done) => {
        originCallback(undefined, (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });

      it('permite request con origin null', (done) => {
        originCallback(null as unknown as string, (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });
    });

    describe('configuración via CORS_ALLOWED_ORIGINS', () => {
      beforeEach(() => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://custom.shop,https://admin.custom.shop';
      });

      it('permite origins personalizados de la variable de entorno', (done) => {
        originCallback('https://custom.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });

      it('rechaza origins de producción cuando se sobrescribe la variable', (done) => {
        originCallback('https://www.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });

      it('rechaza origins no en la lista personalizada', (done) => {
        originCallback('https://evil.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(false);
          done();
        });
      });
    });

    describe('edge cases de CORS_ALLOWED_ORIGINS', () => {
      it('usa defaults cuando la variable es string vacío', (done) => {
        process.env.CORS_ALLOWED_ORIGINS = '';
        originCallback('https://www.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });

      it('usa defaults cuando la variable solo tiene espacios', (done) => {
        process.env.CORS_ALLOWED_ORIGINS = '   ,  ,  ';
        originCallback('https://www.merkee.shop', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });

      it('filtra strings vacíos en la lista', (done) => {
        process.env.CORS_ALLOWED_ORIGINS = 'https://a.com,,https://b.com,';
        originCallback('https://a.com', (err, allow) => {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          done();
        });
      });
    });
  });

  describe('corsOptions', () => {
    it('requiere credenciales', () => {
      expect(corsOptions.credentials).toBe(true);
    });

    it('no refleja origins arbitrarios (usa callback)', () => {
      expect(typeof corsOptions.origin).toBe('function');
    });

    it('expone x-request-id para tracing', () => {
      expect(corsOptions.exposedHeaders).toContain('x-request-id');
    });

    it('incluye todos los métodos requeridos incluyendo PUT', () => {
      const methods = corsOptions.methods as string[];
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('OPTIONS');
    });

    it('incluye PUT para preflight de cambio de cantidad', () => {
      const methods = corsOptions.methods as string[];
      expect(methods).toContain('PUT');
    });

    it('incluye headers de negocio y tracing', () => {
      const headers = corsOptions.allowedHeaders as string[];
      expect(headers).toContain('Content-Type');
      expect(headers).toContain('Authorization');
      expect(headers).toContain('Idempotency-Key');
      expect(headers).toContain('If-Match');
      expect(headers).toContain('Origin');
      expect(headers).toContain('X-CSRF-Token');
      expect(headers).toContain('x-request-id');
    });

    it('configura preflight cache de 24 horas', () => {
      expect(corsOptions.maxAge).toBe(86400);
    });
  });
});
