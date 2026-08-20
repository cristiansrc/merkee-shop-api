import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransportAuthGuard } from './transport-auth.guard';
import { JwtPort } from '../../modules/identity/domain/ports/jwt.port';
import { IDENTITY_TOKENS } from '../../modules/identity/identity.tokens';
import { IdentityModule } from '../../modules/identity/identity.module';
import { PrometheusCartReaperMetricsAdapter } from '../../modules/cart-reservation/infrastructure/adapters/prometheus-cart-reaper-metrics.adapter';
import { ok, fail } from '../domain/result';
import {
  sessionNotFoundOrExpired,
  technicalFailure,
} from '../../modules/identity/domain/identity-errors';
import { DomainErrorCode } from '../domain/domain-error';

/** JWT de prueba firmado con el adapter real (opcional en pruebas unitarias). */
interface MockJwtPort {
  verify: jest.Mock;
}

/** Construye un mock de `JwtPort` con un `verify` configurable. */
function buildJwt(verifyImpl: jest.Mock = jest.fn()): MockJwtPort {
  return { verify: verifyImpl };
}

/** Construye un `ExecutionContext` con un request mutable e inspeccionable. */
function createContext(opts: {
  authorization?: string;
  xRequestId?: string;
  url?: string;
}): {
  context: Parameters<TransportAuthGuard['canActivate']>[0];
  req: { headers: Record<string, string>; originalUrl: string; url: string; user?: unknown };
} {
  const req: {
    headers: Record<string, string>;
    originalUrl: string;
    url: string;
    user?: unknown;
  } = {
    headers: {},
    originalUrl: opts.url ?? '/me',
    url: opts.url ?? '/me',
  };
  if (opts.authorization !== undefined) {
    req.headers['authorization'] = opts.authorization;
  }
  if (opts.xRequestId !== undefined) {
    req.headers['x-request-id'] = opts.xRequestId;
  }
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<TransportAuthGuard['canActivate']>[0];
  return { context, req };
}

/** Lee `code`/`status`/`path`/`trace_id` del cuerpo de una `HttpException`. */
function errorBodyFrom(e: unknown): {
  code: string;
  status: number;
  path: string;
  trace_id: string;
} {
  const err = e as HttpException;
  const response = err.getResponse() as Record<string, unknown>;
  return {
    code: String(response.code ?? ''),
    status: Number(response.status ?? 0),
    path: String(response.path ?? ''),
    trace_id: String(response.trace_id ?? ''),
  };
}

describe('TransportAuthGuard (MSF-API-002 / DEC-02)', () => {
  it('rechaza 401 AUTHENTICATION_REQUIRED sin header Authorization', async () => {
    const guard = new TransportAuthGuard(buildJwt() as unknown as JwtPort);
    const { context } = createContext({ url: '/me' });
    let thrown: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const body = errorBodyFrom(thrown);
    expect(body.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(body.status).toBe(401);
    expect(body.path).toBe('/me');
  });

  it('rechaza 401 AUTHENTICATION_REQUIRED con header no Bearer', async () => {
    const guard = new TransportAuthGuard(buildJwt() as unknown as JwtPort);
    const { context } = createContext({
      authorization: 'Basic dXNlcjpwYXNz',
      url: '/me',
    });
    let thrown: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect(errorBodyFrom(thrown).code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
  });

  it('permite la request y asigna req.user cuando verify devuelve ok', async () => {
    const verify = jest
      .fn()
      .mockResolvedValue(ok({ sub: 'user-1', session_id: 'session-1', role: 'admin' }));
    const guard = new TransportAuthGuard(buildJwt(verify) as unknown as JwtPort);
    const { context, req } = createContext({
      authorization: 'Bearer valid.jwt.token',
      xRequestId: 'trace-1',
      url: '/me',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('valid.jwt.token');
    expect(req.user).toEqual({ id: 'user-1', sessionId: 'session-1', role: 'admin' });
  });

  it('rechaza 401 AUTHENTICATION_REQUIRED cuando verify devuelve token inválido/expirado', async () => {
    const verify = jest.fn().mockResolvedValue(fail(sessionNotFoundOrExpired()));
    const guard = new TransportAuthGuard(buildJwt(verify) as unknown as JwtPort);
    const { context, req } = createContext({
      authorization: 'Bearer expired.jwt.token',
      xRequestId: 'trace-2',
      url: '/me',
    });
    let thrown: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const body = errorBodyFrom(thrown);
    expect(body.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(body.status).toBe(401);
    expect(body.trace_id).toBe('trace-2');
    expect(req.user).toBeUndefined();
  });

  it('rechaza 500 TECHNICAL_DEPENDENCY_FAILURE cuando verify devuelve error técnico', async () => {
    const verify = jest.fn().mockResolvedValue(fail(technicalFailure()));
    const guard = new TransportAuthGuard(buildJwt(verify) as unknown as JwtPort);
    const { context } = createContext({
      authorization: 'Bearer broken.jwt.token',
      url: '/me',
    });
    let thrown: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const body = errorBodyFrom(thrown);
    expect(body.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(body.status).toBe(500);
  });
});

describe('TransportAuthGuard wiring (DEC-06)', () => {
  beforeEach(() => {
    // El registry de prom-client es global al proceso; se limpia antes de
    // instanciar IdentityModule (que registra las métricas del reaper) para
    // evitar duplicados si otro spec del worker ya las registró.
    PrometheusCartReaperMetricsAdapter.clearMetrics();
  });

  it('resuelve JwtPort desde IdentityModule y verifica un JWT firmado real', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
      providers: [TransportAuthGuard],
    }).compile();

    const guard = moduleRef.get(TransportAuthGuard);
    const jwt = moduleRef.get<JwtPort>(IDENTITY_TOKENS.JWT);

    const signed = await jwt.sign({
      sub: 'user-123',
      session_id: 'session-456',
      role: 'admin',
    });
    expect(signed.ok).toBe(true);
    const token = (signed as { ok: true; value: string }).value;

    const { context, req } = createContext({
      authorization: `Bearer ${token}`,
      xRequestId: 'wiring-1',
      url: '/me',
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({
      id: 'user-123',
      sessionId: 'session-456',
      role: 'admin',
    });
  });

  it('rechaza un JWT forjado con 401 AUTHENTICATION_REQUIRED (no 500)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
      providers: [TransportAuthGuard],
    }).compile();

    const guard = moduleRef.get(TransportAuthGuard);
    const { context } = createContext({
      authorization: 'Bearer not-a-jwt',
      url: '/me',
    });
    let thrown: unknown;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const body = errorBodyFrom(thrown);
    expect(body.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(body.status).toBe(401);
  });
});
