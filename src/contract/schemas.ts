/**
 * Tipos de transporte (DTOs de entrada/salida) alineados campo por campo con
 * el contrato OpenAPI `docs/api/openapi.yaml` (MSF-API-003).
 *
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP): solo define la
 * forma de los schemas del contrato. La validación sintáctica de transporte
 * vive en `validation/`; la validación semántica de dominio pertenece al
 * dominio y se devuelve por el rail `Failure` de `Result` (ADR-017).
 *
 * Convenciones de trazabilidad: cada interfaz lleva el nombre exacto del
 * schema OpenAPI (`components/schemas/<Name>`) y cada campo respeta
 * `required`, `nullable`, `enum`, límites y `writeOnly` del contrato.
 */

// ---------------------------------------------------------------------------
// Enums (components/schemas)
// ---------------------------------------------------------------------------

/** Rol de usuario. */
export type Role = 'admin' | 'cliente';

/** Proveedor de pago soportado. */
export type PaymentProvider = 'WOMPI' | 'MERCADO_PAGO';

/** Estado de una orden. */
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_EXPIRED'
  | 'RESERVATION_EXPIRED'
  | 'PAYMENT_REFUND_PENDING'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_REFUND_FAILED';

/** Estado de un pago. */
export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'ERROR'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'REFUND_FAILED';

/** Estado de un reembolso. */
export type RefundStatus = 'PENDING' | 'REFUNDED' | 'REFUND_FAILED';

/** Estado de un carrito. */
export type CartStatus = 'ACTIVE' | 'CHECKOUT_PENDING' | 'CLOSED' | 'EXPIRED';

/** Estado de una reserva de stock. */
export type ReservationStatus =
  | 'ACTIVE'
  | 'CHECKOUT_PENDING'
  | 'CONSUMED'
  | 'RELEASED'
  | 'EXPIRED';

/** Content-Type aceptado para subida de media. */
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp';

// ---------------------------------------------------------------------------
// Schemas de entrada (request)
// ---------------------------------------------------------------------------

/** `RegisterRequest`: registro público de cliente. */
export interface RegisterRequest {
  readonly display_name: string;
  readonly email: string;
  readonly password: string;
}

/** `LoginRequest`: autenticación con correo y contraseña. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/** `PasswordResetRequest`: solicitud de restablecimiento de contraseña. */
export interface PasswordResetRequest {
  readonly email: string;
}

/** `PasswordResetConfirmRequest`: consumo del token de restablecimiento. */
export interface PasswordResetConfirmRequest {
  readonly token: string;
  readonly new_password: string;
}

/**
 * `UpdateProfileRequest`: actualización mínima de perfil (solo
 * `display_name`/`phone`). Al menos una propiedad debe estar presente
 * (`minProperties: 1`). `phone` es nullable.
 */
export interface UpdateProfileRequest {
  readonly display_name?: string;
  readonly phone?: string | null;
}

/**
 * `PasswordChangeRequest`: cambio de contraseña (incluye el primer cambio
 * obligatorio de un admin). `additionalProperties: false`.
 */
export interface PasswordChangeRequest {
  readonly current_password: string;
  readonly new_password: string;
}

/**
 * `CreateAdminUserRequest`: provisión de un admin que requiere activación.
 * `additionalProperties: false`. `phone` es nullable.
 */
export interface CreateAdminUserRequest {
  readonly display_name: string;
  readonly email: string;
  readonly phone?: string | null;
}

/**
 * `AdminActivationRequest`: consumo del token de activación opaco de un solo
 * uso. Ambos campos son `writeOnly`: nunca se devuelven en una respuesta.
 */
export interface AdminActivationRequest {
  readonly token: string;
  readonly new_password: string;
}

/** `DeliveryAddressRequest`: instantánea de dirección de entrega. */
export interface DeliveryAddressRequest {
  readonly recipient_name: string;
  readonly line1: string;
  readonly city: string;
  readonly phone: string;
}

/** `CreateCheckoutRequest`: creación de checkout con dirección y proveedor. */
export interface CreateCheckoutRequest {
  readonly delivery_address: DeliveryAddressRequest;
  readonly payment_provider: PaymentProvider;
}

/** `CartItemMutationRequest`: agregar un ítem al carrito. */
export interface CartItemMutationRequest {
  readonly product_id: string;
  readonly quantity: number;
}

/** `SetCartItemQuantityRequest`: fijar la cantidad reservada de un ítem. */
export interface SetCartItemQuantityRequest {
  readonly quantity: number;
}

/** `CategoryWriteRequest`: creación/actualización de categoría. */
export interface CategoryWriteRequest {
  readonly name: string;
  readonly image_key: string;
}

/** Ítem de imagen dentro de un producto (write). */
export interface ProductImageWrite {
  readonly key: string;
  readonly alt_text: string;
  readonly position: number;
}

/** `ProductWriteRequest`: creación de producto (incluye stock inicial). */
export interface ProductWriteRequest {
  readonly category_id: string;
  readonly name: string;
  readonly description: string;
  readonly regular_price_cop: number;
  readonly sale_price_cop: number;
  readonly unit: string;
  readonly stock_on_hand: number;
  readonly images: readonly ProductImageWrite[];
}

/**
 * `ProductUpdateRequest`: edición general de producto. `stock_on_hand` y
 * `stock_reserved` quedan excluidos (el stock cambia solo vía ajustes).
 * `additionalProperties: false`.
 */
export interface ProductUpdateRequest {
  readonly category_id: string;
  readonly name: string;
  readonly description: string;
  readonly regular_price_cop: number;
  readonly sale_price_cop: number;
  readonly unit: string;
  readonly images: readonly ProductImageWrite[];
}

/**
 * `StockAdjustmentRequest`: ajuste manual de stock auditado. `quantity_delta`
 * es un entero no cero (negativo o positivo). `additionalProperties: false`.
 */
export interface StockAdjustmentRequest {
  readonly quantity_delta: number;
  readonly reason: string;
}

/** `BannerWriteRequest`: creación/actualización de banner. */
export interface BannerWriteRequest {
  readonly name: string;
  readonly image_key: string;
  readonly target_path?: string | null;
  readonly display_order: number;
  readonly active: boolean;
}

/** `CreateUploadUrlRequest`: emisión de URL de subida S3 prefirmada. */
export interface CreateUploadUrlRequest {
  readonly content_type: UploadContentType;
  readonly content_length: number;
}

/**
 * `ProviderWebhookPayload`: carga útil nativa del proveedor retenida
 * mínimamente tras la verificación de la firma. `additionalProperties: true`
 * (cuerpo crudo/opaco, no tipado por el contrato).
 */
export type ProviderWebhookPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Schemas de salida (response)
// ---------------------------------------------------------------------------

/** `UserResponse`: perfil de usuario. `phone` es nullable. */
export interface UserResponse {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: Role;
  readonly must_change_password: boolean;
  readonly phone?: string | null;
}

/**
 * `AdminUserProvisionResponse`: resultado de provisión de admin. `role` es
 * `const: admin` y `must_change_password` es siempre `true`, también en replay.
 * Nunca incluye token ni contraseña.
 */
export interface AdminUserProvisionResponse {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: 'admin';
  readonly must_change_password: true;
  readonly phone?: string | null;
  readonly activation_expires_at: string;
}

/** `SessionResponse`: sesión creada/refrescada. */
export interface SessionResponse {
  readonly access_token: string;
  readonly expires_at: string;
  readonly user: UserResponse;
}

/** `ImageResponse`: imagen de media. */
export interface ImageResponse {
  readonly key: string;
  readonly url: string;
  readonly alt_text: string;
  readonly position: number;
}

/** `CategoryResponse`: categoría con versión de bloqueo optimista. */
export interface CategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly image: ImageResponse;
  readonly version: number;
}

/** `ProductResponse`: producto con stock disponible y versión. */
export interface ProductResponse {
  readonly id: string;
  readonly category: CategoryResponse;
  readonly name: string;
  readonly description: string;
  readonly regular_price_cop: number;
  readonly sale_price_cop: number;
  readonly unit: string;
  readonly stock_available: number;
  readonly images: readonly ImageResponse[];
  readonly version: number;
}

/** `BannerResponse`: banner con versión de bloqueo optimista. */
export interface BannerResponse {
  readonly id: string;
  readonly name: string;
  readonly image: ImageResponse;
  readonly target_path?: string | null;
  readonly display_order: number;
  readonly active: boolean;
  readonly version: number;
}

/** `CartItemResponse`: ítem del carrito con estado de reserva. */
export interface CartItemResponse {
  readonly product: ProductResponse;
  readonly quantity: number;
  readonly reservation_status: ReservationStatus;
  readonly reservation_expires_at: string | null;
}

/** `CartResponse`: carrito del servidor con totales COP. */
export interface CartResponse {
  readonly id: string;
  readonly status: CartStatus;
  readonly items: readonly CartItemResponse[];
  readonly items_subtotal_cop: number;
  readonly delivery_fee_cop: 5000;
  readonly iva_cop: number;
  readonly tax_rate_basis_points: 1900;
  readonly total_cop: number;
  readonly reservation_expires_at: string | null;
}

/** `OrderItemResponse`: línea de una orden. `product_id` es nullable. */
export interface OrderItemResponse {
  readonly product_id: string | null;
  readonly product_name: string;
  readonly unit: string;
  readonly unit_price_cop: number;
  readonly quantity: number;
  readonly subtotal_cop: number;
}

/** `PaymentResponse`: pago asociado a una orden. */
export interface PaymentResponse {
  readonly id: string;
  readonly provider: PaymentProvider;
  readonly status: PaymentStatus;
  readonly amount_cop: number;
  readonly provider_reference?: string | null;
}

/** `PaymentRefundResponse`: reembolso asociado a un pago. */
export interface PaymentRefundResponse {
  readonly id: string;
  readonly status: RefundStatus;
  readonly amount_cop: number;
  readonly provider_refund_reference?: string | null;
}

/**
 * `OrderResponse`: orden con snapshots de dirección de entrega y totales COP.
 * `refund` es `anyOf [PaymentRefundResponse, null]`.
 */
export interface OrderResponse {
  readonly id: string;
  readonly order_number: string;
  readonly status: OrderStatus;
  readonly items_subtotal_cop: number;
  readonly delivery_fee_cop: 5000;
  readonly iva_cop: number;
  readonly tax_rate_basis_points: 1900;
  readonly total_cop: number;
  readonly items: readonly OrderItemResponse[];
  readonly delivery_recipient_name: string;
  readonly delivery_line1: string;
  readonly delivery_city: string;
  readonly delivery_phone: string;
  readonly payment?: PaymentResponse;
  readonly refund?: PaymentRefundResponse | null;
  readonly created_at: string;
}

/** `CheckoutResponse`: resultado de creación de checkout. */
export interface CheckoutResponse {
  readonly order: OrderResponse;
  readonly payment: PaymentResponse;
  readonly provider_checkout_url: string;
}

/** `StockAdjustmentResponse`: ajuste de stock auditado. */
export interface StockAdjustmentResponse {
  readonly id: string;
  readonly product_id: string;
  readonly quantity_delta: number;
  readonly reason: string;
  readonly stock_on_hand_before: number;
  readonly stock_on_hand_after: number;
  readonly stock_reserved: number;
  readonly stock_available: number;
  readonly created_at: string;
}

/** `UploadUrlResponse`: URL de subida S3 prefirmada. */
export interface UploadUrlResponse {
  readonly key: string;
  readonly upload_url: string;
  readonly expires_at: string;
}

/** `PageMeta`: metadatos de paginación. */
export interface PageMeta {
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** `PagedProductResponse`: página de productos. */
export interface PagedProductResponse {
  readonly items: readonly ProductResponse[];
  readonly page: PageMeta;
}

/** `PagedOrderResponse`: página de órdenes. */
export interface PagedOrderResponse {
  readonly items: readonly OrderResponse[];
  readonly page: PageMeta;
}

/** `ApiErrorDetail`: detalle seguro de un error. */
export interface ApiErrorDetail {
  readonly field: string;
  readonly reason: string;
}

/** `ApiErrorResponse`: respuesta pública de error (`application/problem+json`). */
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
