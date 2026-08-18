/**
 * Validadores sintácticos de transporte por schema de entrada (MSF-API-003).
 *
 * Cada validador comprueba únicamente la forma del request conforme al
 * contrato OpenAPI: `required`, `nullable`, `enum`, límites, formatos y
 * `additionalProperties: false`. No aplican reglas de negocio (la validación
 * semántica pertenece al dominio y se devuelve por el rail `Failure`).
 *
 * Estos validadores son funciones puras compatibles con
 * `TransportValidationPipe` (MSF-API-002).
 */

import {
  checkArray,
  checkBoolean,
  checkEmail,
  checkEnum,
  checkInteger,
  checkNullableString,
  checkRecord,
  checkRequired,
  checkString,
  checkUuid,
  createContext,
  toResult,
  type ValidationContext,
  type ValidationResult,
} from './validators';
import type {
  AdminActivationRequest,
  BannerWriteRequest,
  CartItemMutationRequest,
  CategoryWriteRequest,
  CreateAdminUserRequest,
  CreateCheckoutRequest,
  CreateUploadUrlRequest,
  DeliveryAddressRequest,
  LoginRequest,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  ProductUpdateRequest,
  ProductWriteRequest,
  RegisterRequest,
  SetCartItemQuantityRequest,
  StockAdjustmentRequest,
  UpdateProfileRequest,
} from '../schemas';

/** Rechaza claves no declaradas cuando el schema usa `additionalProperties: false`. */
function checkNoAdditionalProperties(
  context: ValidationContext,
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      context.issues.push({
        field: key,
        reason: 'Propiedad no permitida.',
      });
    }
  }
}

/** Valida `RegisterRequest`. */
export function validateRegisterRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'display_name', value.display_name);
  checkString(ctx, 'display_name', value.display_name, {
    minLength: 2,
    maxLength: 100,
  });
  checkRequired(ctx, 'email', value.email);
  checkEmail(ctx, 'email', value.email, { maxLength: 254 });
  checkRequired(ctx, 'password', value.password);
  checkString(ctx, 'password', value.password, {
    minLength: 12,
    maxLength: 128,
  });
  return toResult(ctx);
}

/** Valida `LoginRequest`. */
export function validateLoginRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'email', value.email);
  checkEmail(ctx, 'email', value.email);
  checkRequired(ctx, 'password', value.password);
  checkString(ctx, 'password', value.password, { minLength: 1, maxLength: 128 });
  return toResult(ctx);
}

/** Valida `PasswordResetRequest`. */
export function validatePasswordResetRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'email', value.email);
  checkEmail(ctx, 'email', value.email);
  return toResult(ctx);
}

/** Valida `PasswordResetConfirmRequest`. */
export function validatePasswordResetConfirmRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'token', value.token);
  checkString(ctx, 'token', value.token, { minLength: 32, maxLength: 512 });
  checkRequired(ctx, 'new_password', value.new_password);
  checkString(ctx, 'new_password', value.new_password, {
    minLength: 12,
    maxLength: 128,
  });
  return toResult(ctx);
}

/** Valida `UpdateProfileRequest` (`minProperties: 1`, `phone` nullable). */
export function validateUpdateProfileRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  if (Object.keys(value).length === 0) {
    ctx.issues.push({ field: 'body', reason: 'Al menos una propiedad.' });
  }
  if (value.display_name !== undefined) {
    checkString(ctx, 'display_name', value.display_name, {
      minLength: 2,
      maxLength: 100,
    });
  }
  if (value.phone !== undefined) {
    checkNullableString(ctx, 'phone', value.phone, { maxLength: 30 });
  }
  return toResult(ctx);
}

/** Valida `PasswordChangeRequest` (`additionalProperties: false`). */
export function validatePasswordChangeRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkNoAdditionalProperties(ctx, value, ['current_password', 'new_password']);
  checkRequired(ctx, 'current_password', value.current_password);
  checkString(ctx, 'current_password', value.current_password, {
    minLength: 1,
    maxLength: 128,
  });
  checkRequired(ctx, 'new_password', value.new_password);
  checkString(ctx, 'new_password', value.new_password, {
    minLength: 12,
    maxLength: 128,
  });
  return toResult(ctx);
}

/** Valida `CreateAdminUserRequest` (`additionalProperties: false`). */
export function validateCreateAdminUserRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkNoAdditionalProperties(ctx, value, ['display_name', 'email', 'phone']);
  checkRequired(ctx, 'display_name', value.display_name);
  checkString(ctx, 'display_name', value.display_name, {
    minLength: 2,
    maxLength: 100,
  });
  checkRequired(ctx, 'email', value.email);
  checkEmail(ctx, 'email', value.email, { maxLength: 254 });
  if (value.phone !== undefined) {
    checkNullableString(ctx, 'phone', value.phone, { maxLength: 30 });
  }
  return toResult(ctx);
}

/** Valida `AdminActivationRequest` (`additionalProperties: false`). */
export function validateAdminActivationRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkNoAdditionalProperties(ctx, value, ['token', 'new_password']);
  checkRequired(ctx, 'token', value.token);
  checkString(ctx, 'token', value.token, { minLength: 32, maxLength: 512 });
  checkRequired(ctx, 'new_password', value.new_password);
  checkString(ctx, 'new_password', value.new_password, {
    minLength: 12,
    maxLength: 128,
  });
  return toResult(ctx);
}

/** Valida `DeliveryAddressRequest`. */
export function validateDeliveryAddressRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'delivery_address', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'recipient_name', value.recipient_name);
  checkString(ctx, 'recipient_name', value.recipient_name, {
    minLength: 2,
    maxLength: 100,
  });
  checkRequired(ctx, 'line1', value.line1);
  checkString(ctx, 'line1', value.line1, { minLength: 5, maxLength: 180 });
  checkRequired(ctx, 'city', value.city);
  checkString(ctx, 'city', value.city, { minLength: 2, maxLength: 100 });
  checkRequired(ctx, 'phone', value.phone);
  checkString(ctx, 'phone', value.phone, { minLength: 7, maxLength: 30 });
  return toResult(ctx);
}

/** Valida `CreateCheckoutRequest`. */
export function validateCreateCheckoutRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'delivery_address', value.delivery_address);
  if (value.delivery_address !== undefined) {
    const nested = validateDeliveryAddressRequest(value.delivery_address);
    ctx.issues.push(...nested.issues);
  }
  checkRequired(ctx, 'payment_provider', value.payment_provider);
  checkEnum(ctx, 'payment_provider', value.payment_provider, [
    'WOMPI',
    'MERCADO_PAGO',
  ]);
  return toResult(ctx);
}

/** Valida `CartItemMutationRequest`. */
export function validateCartItemMutationRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'product_id', value.product_id);
  checkUuid(ctx, 'product_id', value.product_id);
  checkRequired(ctx, 'quantity', value.quantity);
  checkInteger(ctx, 'quantity', value.quantity, { minimum: 1, maximum: 999 });
  return toResult(ctx);
}

/** Valida `SetCartItemQuantityRequest`. */
export function validateSetCartItemQuantityRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'quantity', value.quantity);
  checkInteger(ctx, 'quantity', value.quantity, { minimum: 1, maximum: 999 });
  return toResult(ctx);
}

/** Valida `CategoryWriteRequest`. */
export function validateCategoryWriteRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'name', value.name);
  checkString(ctx, 'name', value.name, { minLength: 2, maxLength: 100 });
  checkRequired(ctx, 'image_key', value.image_key);
  checkString(ctx, 'image_key', value.image_key, { minLength: 1 });
  return toResult(ctx);
}

/** Valida un ítem de imagen de producto (write). */
function validateProductImage(
  ctx: ValidationContext,
  field: string,
  value: unknown,
): void {
  if (!checkRecord(ctx, field, value)) {
    return;
  }
  checkRequired(ctx, `${field}.key`, value.key);
  checkString(ctx, `${field}.key`, value.key);
  checkRequired(ctx, `${field}.alt_text`, value.alt_text);
  checkString(ctx, `${field}.alt_text`, value.alt_text, { maxLength: 160 });
  checkRequired(ctx, `${field}.position`, value.position);
  checkInteger(ctx, `${field}.position`, value.position, { minimum: 0 });
}

/** Valida el array `images` de un producto (1..10 ítems). */
function validateProductImages(
  ctx: ValidationContext,
  value: unknown,
): void {
  if (!checkArray(ctx, 'images', value, { minItems: 1, maxItems: 10 })) {
    return;
  }
  value.forEach((item, index) => {
    validateProductImage(ctx, `images[${index}]`, item);
  });
}

/** Valida `ProductWriteRequest`. */
export function validateProductWriteRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'category_id', value.category_id);
  checkUuid(ctx, 'category_id', value.category_id);
  checkRequired(ctx, 'name', value.name);
  checkString(ctx, 'name', value.name, { minLength: 2, maxLength: 160 });
  checkRequired(ctx, 'description', value.description);
  checkString(ctx, 'description', value.description, {
    minLength: 1,
    maxLength: 10000,
  });
  checkRequired(ctx, 'regular_price_cop', value.regular_price_cop);
  checkInteger(ctx, 'regular_price_cop', value.regular_price_cop, {
    minimum: 0,
  });
  checkRequired(ctx, 'sale_price_cop', value.sale_price_cop);
  checkInteger(ctx, 'sale_price_cop', value.sale_price_cop, { minimum: 0 });
  checkRequired(ctx, 'unit', value.unit);
  checkString(ctx, 'unit', value.unit, { minLength: 1, maxLength: 40 });
  checkRequired(ctx, 'stock_on_hand', value.stock_on_hand);
  checkInteger(ctx, 'stock_on_hand', value.stock_on_hand, { minimum: 0 });
  checkRequired(ctx, 'images', value.images);
  validateProductImages(ctx, value.images);
  return toResult(ctx);
}

/** Valida `ProductUpdateRequest` (`additionalProperties: false`). */
export function validateProductUpdateRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkNoAdditionalProperties(ctx, value, [
    'category_id',
    'name',
    'description',
    'regular_price_cop',
    'sale_price_cop',
    'unit',
    'images',
  ]);
  checkRequired(ctx, 'category_id', value.category_id);
  checkUuid(ctx, 'category_id', value.category_id);
  checkRequired(ctx, 'name', value.name);
  checkString(ctx, 'name', value.name, { minLength: 2, maxLength: 160 });
  checkRequired(ctx, 'description', value.description);
  checkString(ctx, 'description', value.description, {
    minLength: 1,
    maxLength: 10000,
  });
  checkRequired(ctx, 'regular_price_cop', value.regular_price_cop);
  checkInteger(ctx, 'regular_price_cop', value.regular_price_cop, {
    minimum: 0,
  });
  checkRequired(ctx, 'sale_price_cop', value.sale_price_cop);
  checkInteger(ctx, 'sale_price_cop', value.sale_price_cop, { minimum: 0 });
  checkRequired(ctx, 'unit', value.unit);
  checkString(ctx, 'unit', value.unit, { minLength: 1, maxLength: 40 });
  checkRequired(ctx, 'images', value.images);
  validateProductImages(ctx, value.images);
  return toResult(ctx);
}

/** Valida `StockAdjustmentRequest` (`additionalProperties: false`). */
export function validateStockAdjustmentRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkNoAdditionalProperties(ctx, value, ['quantity_delta', 'reason']);
  checkRequired(ctx, 'quantity_delta', value.quantity_delta);
  if (typeof value.quantity_delta === 'number') {
    if (!Number.isInteger(value.quantity_delta)) {
      ctx.issues.push({ field: 'quantity_delta', reason: 'Debe ser un entero.' });
    } else if (value.quantity_delta === 0) {
      ctx.issues.push({
        field: 'quantity_delta',
        reason: 'Debe ser distinto de cero.',
      });
    }
  } else {
    ctx.issues.push({ field: 'quantity_delta', reason: 'Debe ser un entero.' });
  }
  checkRequired(ctx, 'reason', value.reason);
  checkString(ctx, 'reason', value.reason, { minLength: 3, maxLength: 500 });
  return toResult(ctx);
}

/** Valida `BannerWriteRequest`. */
export function validateBannerWriteRequest(value: unknown): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'name', value.name);
  checkString(ctx, 'name', value.name, { minLength: 2, maxLength: 160 });
  checkRequired(ctx, 'image_key', value.image_key);
  checkString(ctx, 'image_key', value.image_key);
  if (value.target_path !== undefined) {
    checkNullableString(ctx, 'target_path', value.target_path, {
      pattern: /^\//,
    });
  }
  checkRequired(ctx, 'display_order', value.display_order);
  checkInteger(ctx, 'display_order', value.display_order, { minimum: 0 });
  checkRequired(ctx, 'active', value.active);
  checkBoolean(ctx, 'active', value.active);
  return toResult(ctx);
}

/** Valida `CreateUploadUrlRequest`. */
export function validateCreateUploadUrlRequest(
  value: unknown,
): ValidationResult {
  const ctx = createContext();
  if (!checkRecord(ctx, 'body', value)) {
    return toResult(ctx);
  }
  checkRequired(ctx, 'content_type', value.content_type);
  checkEnum(ctx, 'content_type', value.content_type, [
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  checkRequired(ctx, 'content_length', value.content_length);
  checkInteger(ctx, 'content_length', value.content_length, {
    minimum: 1,
    maximum: 5242880,
  });
  return toResult(ctx);
}

// ---------------------------------------------------------------------------
// Re-export de tipos para conveniencia de los controllers
// ---------------------------------------------------------------------------

export type {
  AdminActivationRequest,
  BannerWriteRequest,
  CartItemMutationRequest,
  CategoryWriteRequest,
  CreateAdminUserRequest,
  CreateCheckoutRequest,
  CreateUploadUrlRequest,
  DeliveryAddressRequest,
  LoginRequest,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  ProductUpdateRequest,
  ProductWriteRequest,
  RegisterRequest,
  SetCartItemQuantityRequest,
  StockAdjustmentRequest,
  UpdateProfileRequest,
};
