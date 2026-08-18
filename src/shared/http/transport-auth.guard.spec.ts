import { UnauthorizedException } from '@nestjs/common';
import { TransportAuthGuard } from './transport-auth.guard';

function createContext(headers: Record<string, string>): {
  context: Parameters<TransportAuthGuard['canActivate']>[0];
} {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as Parameters<TransportAuthGuard['canActivate']>[0];
  return { context };
}

describe('TransportAuthGuard (MSF-API-002)', () => {
  it('permite el acceso con Bearer token de transporte', () => {
    const { context } = createContext({ authorization: 'Bearer token-abc' });
    expect(new TransportAuthGuard().canActivate(context)).toBe(true);
  });

  it('rechaza con 401 AUTHENTICATION_REQUIRED cuando falta el token', () => {
    const { context } = createContext({});
    let thrown: unknown;
    try {
      new TransportAuthGuard().canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnauthorizedException);
    const http = thrown as UnauthorizedException;
    expect(http.getStatus()).toBe(401);
    const body = http.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rechaza con 401 cuando el header no es un Bearer válido', () => {
    const { context } = createContext({ authorization: 'Basic dXNlcjpwYXNz' });
    let thrown: unknown;
    try {
      new TransportAuthGuard().canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnauthorizedException);
  });
});
