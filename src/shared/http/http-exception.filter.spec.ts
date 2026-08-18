import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { domainError, DomainErrorCode } from '../domain/domain-error';
import { buildErrorResponse } from './result-projector';
import { HttpExceptionFilter } from './http-exception.filter';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

interface MockHost {
  switchToHttp: () => {
    getResponse: () => MockResponse;
    getRequest: () => { url: string; headers: Record<string, string> };
  };
}

function createHost(url = '/v1/test', headers?: Record<string, string>): { host: MockHost; response: MockResponse } {
  const response: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host: MockHost = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        url,
        headers: headers ?? { 'x-request-id': 'trace-filter' },
      }),
    }),
  };
  return { host, response };
}

function runFilter(exception: unknown, url = '/v1/test', headers?: Record<string, string>): MockResponse {
  const { host, response } = createHost(url, headers);
  new HttpExceptionFilter().catch(exception, host as unknown as Parameters<HttpExceptionFilter['catch']>[1]);
  return response;
}

describe('HttpExceptionFilter (MSF-API-002)', () => {
  it('convierte 400 de sintaxis a INVALID_DOMAIN_INPUT', () => {
    const response = runFilter(new BadRequestException('email inválido'));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
    expect(body.status).toBe(400);
    expect(body.path).toBe('/v1/test');
    expect(body.trace_id).toBe('trace-filter');
  });

  it('convierte 401 de transporte a AUTHENTICATION_REQUIRED', () => {
    const response = runFilter(new UnauthorizedException());
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json.mock.calls[0][0].code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('convierte 403 de transporte a ACTOR_NOT_AUTHORIZED', () => {
    const response = runFilter(new ForbiddenException());
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json.mock.calls[0][0].code).toBe('ACTOR_NOT_AUTHORIZED');
  });

  it('convierte 404 de transporte a RESOURCE_NOT_FOUND', () => {
    const response = runFilter(new NotFoundException());
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json.mock.calls[0][0].code).toBe('RESOURCE_NOT_FOUND');
  });

  it('convierte 429 de rate limit a RATE_LIMITED', () => {
    const response = runFilter(new HttpException('Too Many Requests', 429));
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json.mock.calls[0][0].code).toBe('RATE_LIMITED');
  });

  it('reenvía un ApiErrorResponse proyectado (409 Conflict)', () => {
    const projected = new HttpException(
      buildErrorResponse(
        domainError(DomainErrorCode.VERSION_MISMATCH, 'conflict', 'version.mismatch'),
        '/v1/admin/products/p-1',
        'trace-409',
      ),
      409,
    );
    const response = runFilter(projected, '/v1/admin/products/p-1');
    expect(response.status).toHaveBeenCalledWith(409);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.status).toBe(409);
    expect(body.trace_id).toBe('trace-filter');
  });

  it('reenvía un ApiErrorResponse proyectado (410 Gone)', () => {
    const projected = new HttpException(
      buildErrorResponse(
        domainError(DomainErrorCode.CART_RESERVATION_EXPIRED, 'gone', 'cart.reservation_expired'),
        '/v1/cart',
        'trace-410',
      ),
      410,
    );
    const response = runFilter(projected, '/v1/cart');
    expect(response.status).toHaveBeenCalledWith(410);
    expect(response.json.mock.calls[0][0].code).toBe('CART_RESERVATION_EXPIRED');
  });

  it('reenvía un ApiErrorResponse proyectado (422 Unprocessable)', () => {
    const projected = new HttpException(
      buildErrorResponse(
        domainError(DomainErrorCode.STOCK_INSUFFICIENT, 'unprocessable', 'stock.insufficient'),
        '/v1/cart/items',
        'trace-422',
      ),
      422,
    );
    const response = runFilter(projected, '/v1/cart/items');
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json.mock.calls[0][0].code).toBe('STOCK_INSUFFICIENT');
  });

  it('traduce una excepción técnica inesperada a 500 TECHNICAL_DEPENDENCY_FAILURE sin filtrar causa', () => {
    const response = runFilter(new Error('secreto: password_hash=abc123'));
    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
    expect(body.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('abc123');
    expect(JSON.stringify(body)).not.toContain('secreto');
  });

  it('maneja HttpException con body string (400)', () => {
    const response = runFilter(new HttpException('Campo requerido', 400));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('Campo requerido');
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
  });

  it('maneja HttpException con body objeto sin message string', () => {
    const response = runFilter(new HttpException({ detail: 'algo' }, 400));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
  });

  it('maneja HttpException con body message array', () => {
    const response = runFilter(new HttpException({ message: ['error1', 'error2'] }, 400));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('error1; error2');
  });

  it('maneja HttpException con body message array vacío', () => {
    const response = runFilter(new HttpException({ message: [] }, 400));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('Solicitud inválida.');
  });

  it('usa x-request-id del header como trace_id', () => {
    const response = runFilter(new Error('fail'), '/v1/test', { 'x-request-id': 'my-trace-123' });
    const body = response.json.mock.calls[0][0];
    expect(body.trace_id).toBe('my-trace-123');
  });

  it('genera UUID cuando no hay x-request-id', () => {
    const response = runFilter(new Error('fail'), '/v1/test', {});
    const body = response.json.mock.calls[0][0];
    expect(body.trace_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('maneja HttpException 410 Gone como transport code', () => {
    const response = runFilter(new GoneException());
    expect(response.status).toHaveBeenCalledWith(410);
    const body = response.json.mock.calls[0][0];
    expect(body.status).toBe(410);
  });

  it('maneja HttpException 500 como TECHNICAL_DEPENDENCY_FAILURE', () => {
    const response = runFilter(new HttpException('Server Error', 500));
    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
  });

  it('maneja HttpException 422 como INVALID_DOMAIN_INPUT', () => {
    const response = runFilter(new HttpException('Unprocessable', 422));
    expect(response.status).toHaveBeenCalledWith(422);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
  });

  it('maneja body null de HttpException', () => {
    const response = runFilter(new HttpException(null as any, 400));
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
  });
});
