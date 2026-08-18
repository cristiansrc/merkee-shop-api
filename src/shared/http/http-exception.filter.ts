/**
 * Filtro global de excepciones HTTP (MSF-API-002).
 *
 * Es el boundary técnico que normaliza cualquier error a un `ApiErrorResponse`
 * OpenAPI:
 *  - Si el cuerpo ya es un `ApiErrorResponse` (proyectado por
 *    `result-projector`), se completa `path`/`trace_id` y se reenvía.
 *  - Si es una `HttpException` de transporte (pipes/guards), se convierte a
 *    `ApiErrorResponse` con el código de transporte correspondiente.
 *  - Cualquier excepción técnica inesperada se traduce a
 *    `500 TECHNICAL_DEPENDENCY_FAILURE` SIN filtrar secretos/PII/causas.
 *
 * El dominio/aplicación nunca lanza `HttpException`; este filtro solo actúa en
 * el adapter HTTP de entrada.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { domainError, DomainErrorCode } from '../domain/domain-error';
import { ApiErrorResponse, isApiErrorResponse } from './api-error-response';
import { mapDomainError } from './domain-error-mapper';
import {
  TRANSPORT_CODE_INVALID_INPUT,
  TRANSPORT_CODE_RATE_LIMITED,
} from './transport-error';

/** Código de transporte por status para errores HTTP "planos" de NestJS. */
function transportCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return TRANSPORT_CODE_INVALID_INPUT;
    case HttpStatus.UNAUTHORIZED:
      return 'AUTHENTICATION_REQUIRED';
    case HttpStatus.FORBIDDEN:
      return 'ACTOR_NOT_AUTHORIZED';
    case HttpStatus.NOT_FOUND:
      return 'RESOURCE_NOT_FOUND';
    case HttpStatus.TOO_MANY_REQUESTS:
      return TRANSPORT_CODE_RATE_LIMITED;
    default:
      return status >= 500
        ? DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE
        : TRANSPORT_CODE_INVALID_INPUT;
  }
}

/** Extrae un mensaje legible del cuerpo de una `HttpException` plana. */
function extractMessage(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object' && body !== null) {
    const candidate = body as Record<string, unknown>;
    const message = candidate.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message.filter((part): part is string => typeof part === 'string');
      return parts.length > 0 ? parts.join('; ') : 'Solicitud inválida.';
    }
  }
  return 'Solicitud inválida.';
}

/** Frase HTTP estándar por status. */
function httpErrorPhrase(status: number): string {
  const phrases: Readonly<Record<number, string>> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
  };
  return phrases[status] ?? 'Internal Server Error';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const path: string =
      typeof request?.url === 'string' ? request.url : '/';
    const traceId: string =
      typeof request?.headers?.['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : randomUUID();

    let status: number;
    let body: ApiErrorResponse;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const rawBody = exception.getResponse();
      if (isApiErrorResponse(rawBody)) {
        body = { ...rawBody, path, trace_id: traceId };
      } else {
        const code = transportCodeForStatus(status);
        body = {
          timestamp: new Date().toISOString(),
          status,
          error: httpErrorPhrase(status),
          code,
          message: extractMessage(rawBody),
          path,
          trace_id: traceId,
        };
      }
    } else {
      // Excepción técnica inesperada: 500 sin revelar causa/secretos/PII.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      const mapped = mapDomainError(
        domainError(
          DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          'technical',
          'technical.dependency_failure',
        ),
      );
      body = {
        timestamp: new Date().toISOString(),
        status,
        error: mapped.error,
        code: mapped.code,
        message: mapped.message,
        path,
        trace_id: traceId,
      };
    }

    response.status(status).json(body);
  }
}
