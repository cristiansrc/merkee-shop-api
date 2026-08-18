/**
 * Proyección de `Result<Success, DomainError>` a HTTP (MSF-API-002).
 *
 * Es el "único puerto" que los controllers invocan para responder: si el
 * `Result` es `Success` devuelve el valor; si es `Failure` lanza una
 * `HttpException` cuyo cuerpo es un `ApiErrorResponse` con `path` y
 * `trace_id` completados aquí (adapter HTTP de entrada).
 *
 * Este archivo pertenece a la capa de transporte (adapter): puede importar
 * `@nestjs/common`. El dominio/aplicación nunca lanza `HttpException`.
 */

import { HttpException } from '@nestjs/common';
import { DomainError } from '../domain/domain-error';
import { isSuccess, Result } from '../domain/result';
import { ApiErrorResponse } from './api-error-response';
import { mapDomainError } from './domain-error-mapper';

/** Construye un `ApiErrorResponse` completo a partir de un `DomainError`. */
export function buildErrorResponse(
  error: DomainError,
  path: string,
  traceId: string,
): ApiErrorResponse {
  const mapped = mapDomainError(error);
  return {
    timestamp: new Date().toISOString(),
    status: mapped.status,
    error: mapped.error,
    code: mapped.code,
    message: mapped.message,
    path,
    trace_id: traceId,
    ...(mapped.details ? { details: mapped.details } : {}),
  };
}

/**
 * Proyecta un `Result` a HTTP. Devuelve el valor de `Success` o lanza una
 * `HttpException` con el `ApiErrorResponse` correspondiente.
 */
export function projectResult<Success>(
  result: Result<Success, DomainError>,
  path: string,
  traceId: string,
): Success {
  if (isSuccess(result)) {
    return result.value;
  }
  const response = buildErrorResponse(result.error, path, traceId);
  throw new HttpException(response, response.status);
}
