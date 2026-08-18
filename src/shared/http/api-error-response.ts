/**
 * Tipos de transporte HTTP de error alineados con el contrato OpenAPI
 * `components/schemas/ApiErrorResponse` y `ApiErrorDetail`
 * (`docs/api/openapi.yaml`).
 *
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP): solo define la
 * forma de la respuesta pública de error. La construcción de la respuesta se
 * realiza en el adapter HTTP de entrada (MSF-API-002).
 */

/** Detalle seguro de un error (sin PII, tokens, hashes ni causas técnicas). */
export interface ApiErrorDetail {
  readonly field: string;
  readonly reason: string;
}

/**
 * Respuesta pública de error (`application/problem+json`).
 *
 * `path` y `trace_id` se completan únicamente en el adapter HTTP; `details`
 * es opcional y nunca incluye secretos/PII.
 */
export interface ApiErrorResponse {
  readonly timestamp: string;
  readonly status: number;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly trace_id: string;
  readonly details?: readonly ApiErrorDetail[];
}

/** Type guard: el cuerpo de una HttpException ya es un `ApiErrorResponse`. */
export function isApiErrorResponse(
  body: unknown,
): body is ApiErrorResponse {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.timestamp === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.error === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.trace_id === 'string'
  );
}
