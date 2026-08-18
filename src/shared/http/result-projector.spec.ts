import { HttpException } from '@nestjs/common';
import { DomainError, domainError, DomainErrorCode } from '../domain/domain-error';
import { fail, ok } from '../domain/result';
import { isApiErrorResponse } from './api-error-response';
import { buildErrorResponse, projectResult } from './result-projector';

describe('ResultProjector (MSF-API-002)', () => {
  it('devuelve el valor en la rama Success', () => {
    const result = ok({ id: 'u-1' });
    const value = projectResult(result, '/v1/me', 'trace-1');
    expect(value).toEqual({ id: 'u-1' });
  });

  it('lanza HttpException con ApiErrorResponse en la rama Failure', () => {
    const result = fail<never, DomainError>(
      domainError(DomainErrorCode.STOCK_INSUFFICIENT, 'unprocessable', 'stock.insufficient'),
    );
    let thrown: unknown;
    try {
      projectResult(result, '/v1/cart/items', 'trace-2');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const http = thrown as HttpException;
    expect(http.getStatus()).toBe(422);
    const body = http.getResponse();
    expect(isApiErrorResponse(body)).toBe(true);
    expect(body).toMatchObject({
      status: 422,
      code: 'STOCK_INSUFFICIENT',
      path: '/v1/cart/items',
      trace_id: 'trace-2',
    });
  });

  it('buildErrorResponse completa path y trace_id', () => {
    const response = buildErrorResponse(
      domainError(DomainErrorCode.ACTOR_NOT_AUTHORIZED, 'authorization', 'auth.actor_not_authorized'),
      '/v1/admin/users',
      'trace-3',
    );
    expect(response.status).toBe(403);
    expect(response.code).toBe('ACTOR_NOT_AUTHORIZED');
    expect(response.path).toBe('/v1/admin/users');
    expect(response.trace_id).toBe('trace-3');
    expect(typeof response.timestamp).toBe('string');
  });

  it('buildErrorResponse incluye details cuando hay metadata segura', () => {
    const response = buildErrorResponse(
      domainError(DomainErrorCode.INVALID_DOMAIN_INPUT, 'validation', 'invalid.input', {
        details: [{ field: 'email', reason: 'Formato inválido.' }],
      }),
      '/v1/users',
      'trace-4',
    );
    expect(response.details).toEqual([{ field: 'email', reason: 'Formato inválido.' }]);
  });

  it('buildErrorResponse omite details cuando no hay metadata', () => {
    const response = buildErrorResponse(
      domainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'not_found', 'resource.not_found'),
      '/v1/items',
      'trace-5',
    );
    expect(response.details).toBeUndefined();
  });

  it('projectResult lanza HttpException con status correcto para 404', () => {
    const result = fail<never, DomainError>(
      domainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'not_found', 'resource.not_found'),
    );
    let thrown: unknown;
    try {
      projectResult(result, '/v1/items/999', 'trace-6');
    } catch (error) {
      thrown = error;
    }
    const http = thrown as HttpException;
    expect(http.getStatus()).toBe(404);
  });

  it('projectResult lanza HttpException con status 409 para conflicto', () => {
    const result = fail<never, DomainError>(
      domainError(DomainErrorCode.VERSION_MISMATCH, 'conflict', 'version.mismatch'),
    );
    let thrown: unknown;
    try {
      projectResult(result, '/v1/products/1', 'trace-7');
    } catch (error) {
      thrown = error;
    }
    const http = thrown as HttpException;
    expect(http.getStatus()).toBe(409);
  });

  it('buildErrorResponse para TECHNICAL_DEPENDENCY_FAILURE retorna 500', () => {
    const response = buildErrorResponse(
      domainError(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE, 'technical', 'technical.dependency_failure'),
      '/v1/health',
      'trace-8',
    );
    expect(response.status).toBe(500);
    expect(response.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
  });
});
