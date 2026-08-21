/**
 * Tests de los validadores sintácticos de transporte (MSF-API-003).
 *
 * Verifican que cada validador acepta un request conforme al contrato y
 * rechaza violaciones de `required`, `nullable`, `enum`, límites, formatos y
 * `additionalProperties: false`. No prueban reglas de negocio (semántica).
 */

import {
  validateAdminActivationRequest,
  validateBannerWriteRequest,
  validateCartItemMutationRequest,
  validateCategoryWriteRequest,
  validateCreateAdminUserRequest,
  validateCreateCheckoutRequest,
  validateCreateUploadUrlRequest,
  validateLoginRequest,
  validatePasswordChangeRequest,
  validatePasswordResetConfirmRequest,
  validatePasswordResetRequest,
  validateProductUpdateRequest,
  validateProductWriteRequest,
  validateRegisterRequest,
  validateSetCartItemQuantityRequest,
  validateStockAdjustmentRequest,
  validateUpdateProfileRequest,
} from './request-validators';

describe('Request validators (MSF-API-003)', () => {
  it('RegisterRequest: acepta un cuerpo válido', () => {
    const result = validateRegisterRequest({
      display_name: 'Cliente Uno',
      email: 'cliente1@merkee.co',
      password: 'ContraseñaSegura123',
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('RegisterRequest: rechaza password corta y email inválido', () => {
    const result = validateRegisterRequest({
      display_name: 'Cliente Uno',
      email: 'no-es-correo',
      password: 'corta',
    });
    expect(result.valid).toBe(false);
    const fields = result.issues.map((i) => i.field);
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('LoginRequest: rechaza password vacía', () => {
    const result = validateLoginRequest({
      email: 'cliente1@merkee.co',
      password: '',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'password')).toBe(true);
  });

  it('LoginRequest: acepta guest_session_id UUID válido (opcional)', () => {
    const result = validateLoginRequest({
      email: 'cliente1@merkee.co',
      password: 'x',
      guest_session_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('LoginRequest: rechaza guest_session_id no UUID', () => {
    const result = validateLoginRequest({
      email: 'cliente1@merkee.co',
      password: 'x',
      guest_session_id: 'no-es-uuid',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'guest_session_id')).toBe(true);
  });

  it('RegisterRequest: acepta guest_session_id UUID válido (opcional)', () => {
    const result = validateRegisterRequest({
      display_name: 'Cliente Uno',
      email: 'cliente1@merkee.co',
      password: 'ContraseñaSegura123',
      guest_session_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('RegisterRequest: rechaza guest_session_id no UUID', () => {
    const result = validateRegisterRequest({
      display_name: 'Cliente Uno',
      email: 'cliente1@merkee.co',
      password: 'ContraseñaSegura123',
      guest_session_id: 'nope',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'guest_session_id')).toBe(true);
  });

  it('PasswordResetRequest: rechaza email ausente', () => {
    const result = validatePasswordResetRequest({});
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'email')).toBe(true);
  });

  it('PasswordResetConfirmRequest: rechaza token corto', () => {
    const result = validatePasswordResetConfirmRequest({
      token: 'corto',
      new_password: 'ContraseñaSegura123',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'token')).toBe(true);
  });

  it('UpdateProfileRequest: acepta solo phone nullable', () => {
    const result = validateUpdateProfileRequest({ phone: null });
    expect(result.valid).toBe(true);
  });

  it('UpdateProfileRequest: rechaza cuerpo vacío (minProperties 1)', () => {
    const result = validateUpdateProfileRequest({});
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'body')).toBe(true);
  });

  it('UpdateProfileRequest: rechaza display_name corto', () => {
    const result = validateUpdateProfileRequest({ display_name: 'A' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'display_name')).toBe(true);
  });

  it('PasswordChangeRequest: rechaza propiedad no permitida (additionalProperties false)', () => {
    const result = validatePasswordChangeRequest({
      current_password: 'ActualSegura123',
      new_password: 'NuevaSegura123',
      email: 'hacker@merkee.co',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'email')).toBe(true);
  });

  it('PasswordChangeRequest: acepta un cuerpo válido', () => {
    const result = validatePasswordChangeRequest({
      current_password: 'ActualSegura123',
      new_password: 'NuevaSegura123',
    });
    expect(result.valid).toBe(true);
  });

  it('CreateAdminUserRequest: acepta phone nullable', () => {
    const result = validateCreateAdminUserRequest({
      display_name: 'Admin Dos',
      email: 'admin2@merkee.co',
      phone: null,
    });
    expect(result.valid).toBe(true);
  });

  it('CreateAdminUserRequest: rechaza propiedad no permitida', () => {
    const result = validateCreateAdminUserRequest({
      display_name: 'Admin Dos',
      email: 'admin2@merkee.co',
      role: 'admin',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'role')).toBe(true);
  });

  it('AdminActivationRequest: rechaza token corto', () => {
    const result = validateAdminActivationRequest({
      token: 'corto',
      new_password: 'ContraseñaSegura123',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'token')).toBe(true);
  });

  it('CreateCheckoutRequest: rechaza proveedor no permitido', () => {
    const result = validateCreateCheckoutRequest({
      delivery_address: {
        recipient_name: 'Cliente Uno',
        line1: 'Calle 1 # 2-3',
        city: 'Bogotá',
        phone: '3001234567',
      },
      payment_provider: 'PAYPAL',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'payment_provider')).toBe(true);
  });

  it('CreateCheckoutRequest: rechaza dirección incompleta', () => {
    const result = validateCreateCheckoutRequest({
      delivery_address: { recipient_name: 'Cliente Uno' },
      payment_provider: 'WOMPI',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'line1')).toBe(true);
  });

  it('CartItemMutationRequest: rechaza product_id no UUID', () => {
    const result = validateCartItemMutationRequest({
      product_id: 'no-es-uuid',
      quantity: 2,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'product_id')).toBe(true);
  });

  it('CartItemMutationRequest: rechaza quantity fuera de rango', () => {
    const result = validateCartItemMutationRequest({
      product_id: '00000000-0000-4000-8000-000000000001',
      quantity: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'quantity')).toBe(true);
  });

  it('SetCartItemQuantityRequest: acepta quantity válida', () => {
    const result = validateSetCartItemQuantityRequest({ quantity: 999 });
    expect(result.valid).toBe(true);
  });

  it('CategoryWriteRequest: rechaza name corto', () => {
    const result = validateCategoryWriteRequest({ name: 'A', image_key: 'k' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('ProductWriteRequest: rechaza images vacío (minItems 1)', () => {
    const result = validateProductWriteRequest({
      category_id: '00000000-0000-4000-8000-000000000001',
      name: 'Producto Uno',
      description: 'Descripción',
      regular_price_cop: 100000,
      sale_price_cop: 90000,
      unit: 'unidad',
      stock_on_hand: 10,
      images: [],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'images')).toBe(true);
  });

  it('ProductUpdateRequest: rechaza stock_on_hand (excluido del contrato)', () => {
    const result = validateProductUpdateRequest({
      category_id: '00000000-0000-4000-8000-000000000001',
      name: 'Producto Uno',
      description: 'Descripción',
      regular_price_cop: 100000,
      sale_price_cop: 90000,
      unit: 'unidad',
      images: [
        { key: 'k', alt_text: 'alt', position: 0 },
      ],
      stock_on_hand: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'stock_on_hand')).toBe(true);
  });

  it('StockAdjustmentRequest: rechaza quantity_delta cero', () => {
    const result = validateStockAdjustmentRequest({
      quantity_delta: 0,
      reason: 'Ajuste manual',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'quantity_delta')).toBe(true);
  });

  it('StockAdjustmentRequest: acepta delta negativo', () => {
    const result = validateStockAdjustmentRequest({
      quantity_delta: -3,
      reason: 'Merma',
    });
    expect(result.valid).toBe(true);
  });

  it('BannerWriteRequest: rechaza target_path sin prefijo /', () => {
    const result = validateBannerWriteRequest({
      name: 'Banner Uno',
      image_key: 'k',
      target_path: 'sin-barra',
      display_order: 0,
      active: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'target_path')).toBe(true);
  });

  it('CreateUploadUrlRequest: rechaza content_type no permitido', () => {
    const result = validateCreateUploadUrlRequest({
      content_type: 'image/gif',
      content_length: 1000,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'content_type')).toBe(true);
  });

  it('CreateUploadUrlRequest: rechaza content_length fuera de rango', () => {
    const result = validateCreateUploadUrlRequest({
      content_type: 'image/jpeg',
      content_length: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'content_length')).toBe(true);
  });

  it('rechaza un cuerpo que no es un objeto', () => {
    const result = validateRegisterRequest('no-es-objeto');
    expect(result.valid).toBe(false);
  });
});
