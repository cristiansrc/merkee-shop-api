/**
 * RCA-FIX: Verificación de que el prefijo global v1 se aplica correctamente
 * a las rutas de negocio y que GET /health queda excluido (sin prefijo).
 *
 * El ALB de AWS verifica /health en la raíz del target group.
 * OpenAPI y frontends consumen https://api.merkee.shop/v1/*.
 *
 * Estrategia: Se levanta la app NestJS en un puerto aleatorio y se
 * verifican las rutas ejecutando requests HTTP reales. Esto valida
 * que el `setGlobalPrefix` funciona correctamente en el Express adapter.
 */

import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import { AppModule } from './app.module';
import { PrismaService } from './modules/identity/infrastructure/prisma.service';
import { CartPrismaService } from './modules/cart-reservation/infrastructure/cart-prisma.service';

/** Mock seguro de PrismaService: evita conexión a BD en CI. */
const mockPrismaService = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

/** Mock seguro de CartPrismaService: evita conexión a BD en CI. */
const mockCartPrismaService = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

/** Helper: request HTTP simple contra localhost. */
function httpGet(
  port: number,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

describe('Global route prefix v1 (RCA-FIX)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(CartPrismaService)
      .useValue(mockCartPrismaService)
      .compile();

    app = moduleRef.createNestApplication();

    // RCA-FIX: Replica la misma configuración que src/main.ts
    app.setGlobalPrefix('v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });

    await app.init();

    // Levantar en puerto 0 (asigna uno aleatorio)
    await app.listen(0);
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health responde 200 sin prefijo v1', async () => {
    const res = await httpGet(port, '/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('GET /v1/health NO existe (404)', async () => {
    const res = await httpGet(port, '/v1/health');
    expect(res.status).toBe(404);
  });

  it('GET /v1/me existe (no 404) — identidad bajo prefijo', async () => {
    const res = await httpGet(port, '/v1/me');
    // Puede devolver 401 (no auth) pero NO 404
    expect(res.status).not.toBe(404);
  });

  it('POST /v1/auth/password-change existe', async () => {
    // POST sin body → verificar que la ruta existe (no 404)
    const res = await httpGet(port, '/v1/auth/password-change');
    // GET a ruta POST puede dar 404 en Express si solo acepta POST,
    // así que probamos con un POST real
    const postRes = await httpPost(port, '/v1/auth/password-change', '{}');
    // Puede fallar validación pero la ruta existe
    expect(postRes.status).not.toBe(404);
  });

  it('POST /v1/media/upload-urls existe', async () => {
    const res = await httpPost(port, '/v1/media/upload-urls', '{}');
    expect(res.status).not.toBe(404);
  });

  it('rutas de catálogo bajo /v1/ (no 404)', async () => {
    // CatalogController usa @Controller() sin path; rutas: /categories, /products, etc.
    const res = await httpGet(port, '/v1/categories');
    expect(res.status).not.toBe(404);
  });

  it('rutas de carrito bajo /v1/', async () => {
    const res = await httpGet(port, '/v1/cart');
    expect(res.status).not.toBe(404);
  });

  it('rutas de pedidos bajo /v1/', async () => {
    const res = await httpGet(port, '/v1/orders');
    expect(res.status).not.toBe(404);
  });

  it('rutas de checkout bajo /v1/', async () => {
    const res = await httpPost(port, '/v1/checkouts', '{}');
    expect(res.status).not.toBe(404);
  });

  it('rutas de webhooks bajo /v1/', async () => {
    // PaymentsWebhookController usa @Controller('webhooks'); rutas: /webhooks/wompi, /webhooks/mercado-pago
    const res = await httpPost(port, '/v1/webhooks/mercado-pago', '{}');
    expect(res.status).not.toBe(404);
  });

  it('ruta raíz sin prefijo para rutas de negocio devuelve 404', async () => {
    // /me sin prefijo NO debe existir
    const res = await httpGet(port, '/me');
    expect(res.status).toBe(404);
  });

  it('/auth sin prefijo NO debe existir', async () => {
    const res = await httpGet(port, '/auth/password-change');
    expect(res.status).toBe(404);
  });
});

/** Helper: request HTTP POST simple contra localhost. */
function httpPost(
  port: number,
  path: string,
  body: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: buf }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
