/**
 * Mapper `DomainError → ApiErrorResponse` (MSF-API-002).
 *
 * Proyecta un `DomainError` del catálogo estable (ADR-017 / Master Spec §ROP)
 * a su status HTTP, frase de error, `code` exacto, `message` localizado por
 * `messageKey` y `details` seguros. `path` y `trace_id` NO se completan aquí:
 * los rellena el adapter HTTP (result-projector / exception filter).
 *
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP) para poder
 * testearse de forma unitaria. No revela causas, secretos, hashes ni PII.
 */

import {
  DomainError,
  DomainErrorCode,
} from '../domain/domain-error';
import { ApiErrorDetail } from './api-error-response';

/** Resultado intermedio del mapper (sin `path`/`trace_id`). */
export interface MappedDomainError {
  readonly status: number;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
}

/** Frase HTTP estándar por status. */
const HTTP_ERROR_PHRASE: Readonly<Record<number, string>> = {
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

/**
 * Tabla canónica código → status HTTP (Master Spec §ROP). Aditiva: no se
 * renombran ni reutilizan códigos. Un código desconocido no se serializa
 * como tal: se degrada a `TECHNICAL_DEPENDENCY_FAILURE` (500).
 */
const DOMAIN_ERROR_HTTP: Readonly<
  Record<DomainErrorCode, { readonly status: number }>
> = {
  INVALID_DOMAIN_INPUT: { status: 400 },
  AUTHENTICATION_REQUIRED: { status: 401 },
  INVALID_CREDENTIALS: { status: 401 },
  INVALID_WEBHOOK_SIGNATURE: { status: 401 },
  ADMIN_STOREFRONT_PURCHASE_FORBIDDEN: { status: 403 },
  INITIAL_PASSWORD_CHANGE_REQUIRED: { status: 403 },
  ACTOR_NOT_AUTHORIZED: { status: 403 },
  RESOURCE_NOT_FOUND: { status: 404 },
  CART_ITEM_NOT_FOUND: { status: 404 },
  SESSION_EXPIRED: { status: 410 },
  CART_RESERVATION_EXPIRED: { status: 410 },
  EMAIL_ALREADY_REGISTERED: { status: 409 },
  IDEMPOTENCY_KEY_REUSED: { status: 409 },
  VERSION_MISMATCH: { status: 409 },
  DUPLICATE_WEBHOOK_EVENT: { status: 409 },
  ORDER_ALREADY_EXISTS: { status: 409 },
  INVALID_STATE_TRANSITION: { status: 409 },
  ACTIVATION_TOKEN_INVALID_OR_EXPIRED: { status: 422 },
  PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED: { status: 422 },
  CURRENT_PASSWORD_INVALID: { status: 422 },
  STOCK_INSUFFICIENT: { status: 422 },
  RESERVATION_NOT_ACTIVE: { status: 422 },
  CHECKOUT_NOT_ALLOWED: { status: 422 },
  PAYMENT_HOLD_NOT_CONSUMABLE: { status: 422 },
  TECHNICAL_DEPENDENCY_FAILURE: { status: 500 },
};

/** Mensajes por defecto en `es-CO` por código (fallback si no hay messageKey). */
const DEFAULT_MESSAGE_BY_CODE: Readonly<Record<DomainErrorCode, string>> = {
  INVALID_DOMAIN_INPUT: 'La solicitud contiene datos inválidos.',
  AUTHENTICATION_REQUIRED: 'Se requiere autenticación.',
  INVALID_CREDENTIALS: 'Credenciales inválidas.',
  INVALID_WEBHOOK_SIGNATURE: 'Firma de webhook inválida.',
  ADMIN_STOREFRONT_PURCHASE_FORBIDDEN:
    'El administrador no puede realizar compras en la tienda.',
  INITIAL_PASSWORD_CHANGE_REQUIRED:
    'Debe cambiar su contraseña inicial antes de continuar.',
  ACTOR_NOT_AUTHORIZED: 'No tiene permisos para realizar esta acción.',
  RESOURCE_NOT_FOUND: 'Recurso no encontrado.',
  CART_ITEM_NOT_FOUND: 'Ítem del carrito no encontrado.',
  SESSION_EXPIRED: 'La sesión ha expirado.',
  CART_RESERVATION_EXPIRED: 'La reserva del carrito ha expirado.',
  EMAIL_ALREADY_REGISTERED: 'El correo ya está registrado.',
  IDEMPOTENCY_KEY_REUSED: 'La clave de idempotencia ya fue utilizada.',
  VERSION_MISMATCH: 'La versión del recurso no coincide.',
  DUPLICATE_WEBHOOK_EVENT: 'Evento de webhook duplicado.',
  ORDER_ALREADY_EXISTS: 'La orden ya existe.',
  INVALID_STATE_TRANSITION: 'Transición de estado inválida.',
  ACTIVATION_TOKEN_INVALID_OR_EXPIRED:
    'El token de activación es inválido o ha expirado.',
  PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED:
    'El token de restablecimiento es inválido o ha expirado.',
  CURRENT_PASSWORD_INVALID: 'La contraseña actual es incorrecta.',
  STOCK_INSUFFICIENT: 'Stock insuficiente.',
  RESERVATION_NOT_ACTIVE: 'La reserva no está activa.',
  CHECKOUT_NOT_ALLOWED: 'El checkout no está permitido.',
  PAYMENT_HOLD_NOT_CONSUMABLE: 'El hold de pago no es consumible.',
  TECHNICAL_DEPENDENCY_FAILURE: 'Error interno del servidor.',
};

/**
 * Catálogo de mensajes localizados por `messageKey` (`es-CO`). Si el
 * `DomainError` trae un `messageKey` conocido se usa su mensaje; si no, se
 * usa el mensaje por defecto del código.
 */
const MESSAGE_BY_KEY: Readonly<Record<string, string>> = {
  'invalid.input': 'La solicitud contiene datos inválidos.',
  'auth.required': 'Se requiere autenticación.',
  'auth.invalid_credentials': 'Credenciales inválidas.',
  'webhook.invalid_signature': 'Firma de webhook inválida.',
  'admin.storefront_purchase_forbidden':
    'El administrador no puede realizar compras en la tienda.',
  'admin.initial_password_change_required':
    'Debe cambiar su contraseña inicial antes de continuar.',
  'auth.actor_not_authorized': 'No tiene permisos para realizar esta acción.',
  'resource.not_found': 'Recurso no encontrado.',
  'cart.item_not_found': 'Ítem del carrito no encontrado.',
  'session.expired': 'La sesión ha expirado.',
  'cart.reservation_expired': 'La reserva del carrito ha expirado.',
  'identity.email_already_registered': 'El correo ya está registrado.',
  'idempotency.key_reused': 'La clave de idempotencia ya fue utilizada.',
  'version.mismatch': 'La versión del recurso no coincide.',
  'webhook.duplicate_event': 'Evento de webhook duplicado.',
  'order.already_exists': 'La orden ya existe.',
  'state.invalid_transition': 'Transición de estado inválida.',
  'activation.token_invalid_or_expired':
    'El token de activación es inválido o ha expirado.',
  'password_reset.token_invalid_or_expired':
    'El token de restablecimiento es inválido o ha expirado.',
  'password.current_invalid': 'La contraseña actual es incorrecta.',
  'stock.insufficient': 'Stock insuficiente.',
  'reservation.not_active': 'La reserva no está activa.',
  'checkout.not_allowed': 'El checkout no está permitido.',
  'payment.hold_not_consumable': 'El hold de pago no es consumible.',
  'technical.dependency_failure': 'Error interno del servidor.',
};

/**
 * Extrae `details` seguros desde `metadata`. Solo se aceptan entradas
 * `{ field: string, reason: string }`; cualquier otro dato se descarta para
 * no filtrar secretos/PII/causas técnicas.
 */
function sanitizeDetails(
  metadata: Readonly<Record<string, unknown>> | undefined,
): readonly ApiErrorDetail[] | undefined {
  if (!metadata) {
    return undefined;
  }
  const raw = metadata.details;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const safe: ApiErrorDetail[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const keys = Object.keys(candidate);
    if (
      keys.length === 2 &&
      typeof candidate.field === 'string' &&
      typeof candidate.reason === 'string'
    ) {
      safe.push({ field: candidate.field, reason: candidate.reason });
    }
  }
  return safe.length > 0 ? safe : undefined;
}

/** Resuelve el mensaje localizado por `messageKey` con fallback por código. */
export function resolveMessage(error: DomainError): string {
  if (error.messageKey && MESSAGE_BY_KEY[error.messageKey]) {
    return MESSAGE_BY_KEY[error.messageKey];
  }
  return DEFAULT_MESSAGE_BY_CODE[error.code];
}

/**
 * Proyecta un `DomainError` a su representación HTTP canónica.
 *
 * Un código fuera del catálogo no se serializa como tal: se degrada a
 * `TECHNICAL_DEPENDENCY_FAILURE` (500) para no emitir códigos inventados.
 */
export function mapDomainError(error: DomainError): MappedDomainError {
  const mapping = DOMAIN_ERROR_HTTP[error.code];
  const status = mapping ? mapping.status : 500;
  const code = mapping ? error.code : DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE;
  const message = mapping
    ? resolveMessage(error)
    : DEFAULT_MESSAGE_BY_CODE[DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE];
  const details = sanitizeDetails(error.metadata);
  return {
    status,
    error: HTTP_ERROR_PHRASE[status] ?? 'Internal Server Error',
    code,
    message,
    ...(details ? { details } : {}),
  };
}
