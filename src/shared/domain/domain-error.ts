/**
 * Catálogo estable de `DomainError` (ADR-017 / Master Spec §ROP).
 *
 * Un `DomainError` es un valor discriminado estable (`code`, `kind`,
 * `messageKey`, `metadata` sin secretos/PII) y NO una excepción. Las ramas
 * esperadas de negocio se devuelven por el rail `Failure` de `Result`.
 *
 * La proyección a `ApiErrorResponse` (status HTTP, `path`, `trace_id`) se
 * realiza únicamente en el adapter HTTP de entrada (MSF-API-002). Este archivo
 * NO importa NestJS, Prisma ni HTTP: es TypeScript puro.
 */

/** Clasificación semántica del error, independiente del transporte HTTP. */
export type DomainErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'unprocessable'
  | 'technical';

/** Códigos estables del catálogo (aditivo: no se renombran ni reutilizan). */
export const DomainErrorCode = {
  INVALID_DOMAIN_INPUT: 'INVALID_DOMAIN_INPUT',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
  ADMIN_STOREFRONT_PURCHASE_FORBIDDEN: 'ADMIN_STOREFRONT_PURCHASE_FORBIDDEN',
  INITIAL_PASSWORD_CHANGE_REQUIRED: 'INITIAL_PASSWORD_CHANGE_REQUIRED',
  ACTOR_NOT_AUTHORIZED: 'ACTOR_NOT_AUTHORIZED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CART_ITEM_NOT_FOUND: 'CART_ITEM_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CART_RESERVATION_EXPIRED: 'CART_RESERVATION_EXPIRED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  DUPLICATE_WEBHOOK_EVENT: 'DUPLICATE_WEBHOOK_EVENT',
  ORDER_ALREADY_EXISTS: 'ORDER_ALREADY_EXISTS',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  ACTIVATION_TOKEN_INVALID_OR_EXPIRED: 'ACTIVATION_TOKEN_INVALID_OR_EXPIRED',
  PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED:
    'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED',
  CURRENT_PASSWORD_INVALID: 'CURRENT_PASSWORD_INVALID',
  STOCK_INSUFFICIENT: 'STOCK_INSUFFICIENT',
  RESERVATION_NOT_ACTIVE: 'RESERVATION_NOT_ACTIVE',
  CHECKOUT_NOT_ALLOWED: 'CHECKOUT_NOT_ALLOWED',
  PAYMENT_HOLD_NOT_CONSUMABLE: 'PAYMENT_HOLD_NOT_CONSUMABLE',
  TECHNICAL_DEPENDENCY_FAILURE: 'TECHNICAL_DEPENDENCY_FAILURE',
} as const;

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

/** Valor discriminado estable de error de negocio. */
export interface DomainError {
  readonly code: DomainErrorCode;
  readonly kind: DomainErrorKind;
  /** Clave de localización de mensaje (`es-CO`). Nunca texto crudo. */
  readonly messageKey: string;
  /** Metadatos adicionales sin secretos ni PII. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Construye un `DomainError` del catálogo. */
export function domainError(
  code: DomainErrorCode,
  kind: DomainErrorKind,
  messageKey: string,
  metadata?: Readonly<Record<string, unknown>>,
): DomainError {
  return { code, kind, messageKey, metadata };
}
