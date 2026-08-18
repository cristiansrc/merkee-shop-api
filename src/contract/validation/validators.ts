/**
 * Helpers de validación sintáctica de transporte (MSF-API-003).
 *
 * Validan únicamente la estructura/forma de request/header/path conforme al
 * contrato OpenAPI (required, nullable, enums, límites, formatos). La
 * validación semántica de negocio pertenece al dominio y se devuelve por el
 * rail `Failure` de `Result`, nunca aquí.
 *
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP).
 */

/** Detalle de un fallo de validación de transporte. */
export interface ValidationIssue {
  readonly field: string;
  readonly reason: string;
}

/** Resultado de una validación de transporte. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Acumulador de issues para construir un `ValidationResult`. */
export interface ValidationContext {
  readonly issues: ValidationIssue[];
}

/** Crea un contexto de validación vacío. */
export function createContext(): ValidationContext {
  return { issues: [] };
}

/** Convierte el contexto en un `ValidationResult`. */
export function toResult(context: ValidationContext): ValidationResult {
  return { valid: context.issues.length === 0, issues: context.issues };
}

/** `true` si el valor es un objeto plano (no array, no null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valida que el valor sea un objeto plano. */
export function checkRecord(
  context: ValidationContext,
  field: string,
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    context.issues.push({ field, reason: 'Debe ser un objeto.' });
    return false;
  }
  return true;
}

/** Valida que el campo requerido esté presente (no `undefined`). */
export function checkRequired(
  context: ValidationContext,
  field: string,
  value: unknown,
): void {
  if (value === undefined) {
    context.issues.push({ field, reason: 'Campo requerido.' });
  }
}

/** Valida una cadena con límites/patrón opcionales. */
export function checkString(
  context: ValidationContext,
  field: string,
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {},
): value is string {
  if (typeof value !== 'string') {
    context.issues.push({ field, reason: 'Debe ser una cadena.' });
    return false;
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    context.issues.push({
      field,
      reason: `Longitud mínima ${options.minLength}.`,
    });
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    context.issues.push({
      field,
      reason: `Longitud máxima ${options.maxLength}.`,
    });
  }
  if (options.pattern !== undefined && !options.pattern.test(value)) {
    context.issues.push({ field, reason: 'Formato inválido.' });
  }
  return true;
}

/** Valida una cadena nullable (string o null). */
export function checkNullableString(
  context: ValidationContext,
  field: string,
  value: unknown,
  options: { maxLength?: number; pattern?: RegExp } = {},
): void {
  if (value === null) {
    return;
  }
  checkString(context, field, value, options);
}

/** Valida un entero con límites opcionales. */
export function checkInteger(
  context: ValidationContext,
  field: string,
  value: unknown,
  options: { minimum?: number; maximum?: number } = {},
): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    context.issues.push({ field, reason: 'Debe ser un entero.' });
    return false;
  }
  if (options.minimum !== undefined && value < options.minimum) {
    context.issues.push({ field, reason: `Mínimo ${options.minimum}.` });
  }
  if (options.maximum !== undefined && value > options.maximum) {
    context.issues.push({ field, reason: `Máximo ${options.maximum}.` });
  }
  return true;
}

/** Valida un booleano. */
export function checkBoolean(
  context: ValidationContext,
  field: string,
  value: unknown,
): value is boolean {
  if (typeof value !== 'boolean') {
    context.issues.push({ field, reason: 'Debe ser un booleano.' });
    return false;
  }
  return true;
}

/** Valida que el valor pertenezca a un conjunto de enums. */
export function checkEnum<T extends string>(
  context: ValidationContext,
  field: string,
  value: unknown,
  allowed: readonly T[],
): value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    context.issues.push({ field, reason: 'Valor no permitido.' });
    return false;
  }
  return true;
}

/** Valida un UUID (`format: uuid`). */
export function checkUuid(
  context: ValidationContext,
  field: string,
  value: unknown,
): value is string {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return checkString(context, field, value, { pattern: uuidPattern });
}

/** Valida un correo (`format: email`). */
export function checkEmail(
  context: ValidationContext,
  field: string,
  value: unknown,
  options: { maxLength?: number } = {},
): value is string {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return checkString(context, field, value, {
    pattern: emailPattern,
    maxLength: options.maxLength,
  });
}

/** Valida una fecha-hora ISO 8601 (`format: date-time`). */
export function checkDateTime(
  context: ValidationContext,
  field: string,
  value: unknown,
): value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    context.issues.push({ field, reason: 'Fecha-hora inválida.' });
    return false;
  }
  return true;
}

/** Valida una URI (`format: uri`). */
export function checkUri(
  context: ValidationContext,
  field: string,
  value: unknown,
): value is string {
  if (typeof value !== 'string') {
    context.issues.push({ field, reason: 'Debe ser una cadena.' });
    return false;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    context.issues.push({ field, reason: 'URI inválida.' });
    return false;
  }
  return true;
}

/** Valida un array con límites opcionales. */
export function checkArray(
  context: ValidationContext,
  field: string,
  value: unknown,
  options: { minItems?: number; maxItems?: number } = {},
): value is unknown[] {
  if (!Array.isArray(value)) {
    context.issues.push({ field, reason: 'Debe ser un array.' });
    return false;
  }
  if (options.minItems !== undefined && value.length < options.minItems) {
    context.issues.push({ field, reason: `Mínimo ${options.minItems} ítems.` });
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    context.issues.push({ field, reason: `Máximo ${options.maxItems} ítems.` });
  }
  return true;
}
