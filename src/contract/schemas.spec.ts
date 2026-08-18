/**
 * Tests de los tipos de transporte del contrato (MSF-API-003).
 *
 * Verifican que los DTOs de salida nunca incluyen campos secretos/write-only,
 * que los enums coinciden con el contrato y que los campos nullable se
 * serializan correctamente. Las aserciones de tipo (`@ts-expect-error`)
 * garantizan en tiempo de compilación que un campo prohibido no es una clave
 * válida del tipo.
 */

import {
  AdminUserProvisionResponse,
  AdminActivationRequest,
  CartResponse,
  OrderResponse,
  PaymentProvider,
  ReservationStatus,
  Role,
  UserResponse,
} from './schemas';

/** Extrae las claves de un tipo como unión. */
type KeysOf<T> = { [K in keyof T]: K }[keyof T];

describe('Contract schemas (MSF-API-003)', () => {
  it('AdminUserProvisionResponse nunca expone token ni contraseña', () => {
    // Compile-time: 'token' y 'password' no son claves válidas del tipo.
    // @ts-expect-error - token no debe existir en la respuesta de provisión
    const forbiddenToken: KeysOf<AdminUserProvisionResponse> = 'token';
    // @ts-expect-error - password no debe existir en la respuesta de provisión
    const forbiddenPassword: KeysOf<AdminUserProvisionResponse> = 'password';
    void forbiddenToken;
    void forbiddenPassword;

    const response: AdminUserProvisionResponse = {
      id: '00000000-0000-4000-8000-000000000001',
      display_name: 'Admin Uno',
      email: 'admin1@merkee.co',
      role: 'admin',
      must_change_password: true,
      activation_expires_at: '2026-08-16T00:00:00.000Z',
    };
    const parsed = JSON.parse(JSON.stringify(response)) as Record<
      string,
      unknown
    >;
    expect('token' in parsed).toBe(false);
    expect('password' in parsed).toBe(false);
    expect('new_password' in parsed).toBe(false);
  });

  it('AdminActivationRequest declara token y new_password como writeOnly (solo entrada)', () => {
    // Compile-time: el tipo de entrada sí tiene ambos campos.
    const request: AdminActivationRequest = {
      token: 'a'.repeat(32),
      new_password: 'NuevaClaveSegura123',
    };
    expect(request.token.length).toBeGreaterThanOrEqual(32);
    expect(request.new_password.length).toBeGreaterThanOrEqual(12);
  });

  it('los enums coinciden exactamente con el contrato OpenAPI', () => {
    const roles: readonly Role[] = ['admin', 'cliente'];
    const providers: readonly PaymentProvider[] = ['WOMPI', 'MERCADO_PAGO'];
    const reservationStatuses: readonly ReservationStatus[] = [
      'ACTIVE',
      'CHECKOUT_PENDING',
      'CONSUMED',
      'RELEASED',
      'EXPIRED',
    ];
    expect(roles).toEqual(['admin', 'cliente']);
    expect(providers).toEqual(['WOMPI', 'MERCADO_PAGO']);
    expect(reservationStatuses).toEqual([
      'ACTIVE',
      'CHECKOUT_PENDING',
      'CONSUMED',
      'RELEASED',
      'EXPIRED',
    ]);
  });

  it('UserResponse serializa phone nullable como null', () => {
    const user: UserResponse = {
      id: '00000000-0000-4000-8000-000000000002',
      display_name: 'Cliente Uno',
      email: 'cliente1@merkee.co',
      role: 'cliente',
      must_change_password: false,
      phone: null,
    };
    expect(JSON.parse(JSON.stringify(user)).phone).toBeNull();
  });

  it('CartResponse fija delivery_fee_cop=5000 y tax_rate_basis_points=1900', () => {
    const cart: CartResponse = {
      id: '00000000-0000-4000-8000-000000000003',
      status: 'ACTIVE',
      items: [],
      items_subtotal_cop: 100000,
      delivery_fee_cop: 5000,
      iva_cop: 19000,
      tax_rate_basis_points: 1900,
      total_cop: 124000,
      reservation_expires_at: '2026-08-15T17:30:00.000Z',
    };
    expect(cart.delivery_fee_cop).toBe(5000);
    expect(cart.tax_rate_basis_points).toBe(1900);
  });

  it('OrderResponse incluye snapshots de dirección de entrega', () => {
    const order: OrderResponse = {
      id: '00000000-0000-4000-8000-000000000004',
      order_number: 'MK-000001',
      status: 'PENDING_PAYMENT',
      items_subtotal_cop: 100000,
      delivery_fee_cop: 5000,
      iva_cop: 19000,
      tax_rate_basis_points: 1900,
      total_cop: 124000,
      items: [],
      delivery_recipient_name: 'Cliente Uno',
      delivery_line1: 'Calle 1 # 2-3',
      delivery_city: 'Bogotá',
      delivery_phone: '3001234567',
      created_at: '2026-08-15T17:00:00.000Z',
    };
    expect(order.delivery_recipient_name).toBe('Cliente Uno');
    expect(order.delivery_line1).toBe('Calle 1 # 2-3');
    expect(order.delivery_city).toBe('Bogotá');
    expect(order.delivery_phone).toBe('3001234567');
  });
});
