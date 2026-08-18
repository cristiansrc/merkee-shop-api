/**
 * Validadores sintácticos de headers de transporte (MSF-API-003).
 *
 * Validan únicamente la forma de los headers conforme al contrato OpenAPI
 * `components/parameters`: `Idempotency-Key` (UUID) e `If-Match` (cadena
 * numérica `^[0-9]+$`). No aplican reglas de negocio.
 */

import {
  checkString,
  checkUuid,
  createContext,
  toResult,
  type ValidationResult,
} from './validators';

/**
 * Valida el header `Idempotency-Key` (`format: uuid`).
 *
 * Devuelve `{ valid: false }` para un valor ausente o que no es un UUID.
 */
export function validateIdempotencyKey(value: unknown): ValidationResult {
  const ctx = createContext();
  if (value === undefined) {
    ctx.issues.push({ field: 'Idempotency-Key', reason: 'Header requerido.' });
    return toResult(ctx);
  }
  checkUuid(ctx, 'Idempotency-Key', value);
  return toResult(ctx);
}

/**
 * Valida el header `If-Match` (`pattern: '^[0-9]+$'`).
 *
 * Es una cadena numérica (la `version` esperada). Devuelve `{ valid: false }`
 * para un valor ausente o no numérico.
 */
export function validateIfMatch(value: unknown): ValidationResult {
  const ctx = createContext();
  if (value === undefined) {
    ctx.issues.push({ field: 'If-Match', reason: 'Header requerido.' });
    return toResult(ctx);
  }
  checkString(ctx, 'If-Match', value, { pattern: /^[0-9]+$/ });
  return toResult(ctx);
}

/**
 * Valida un header de firma de webhook (requerido, longitud mínima 1).
 * Se usa para `X-Event-Signature`, `X-Signature`, `X-Event-Id` y
 * `X-Request-Id`.
 */
export function validateWebhookHeader(
  name: string,
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (value === undefined) {
    ctx.issues.push({ field: name, reason: 'Header requerido.' });
    return toResult(ctx);
  }
  checkString(ctx, name, value, { minLength: 1 });
  return toResult(ctx);
}
