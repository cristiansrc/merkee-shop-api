/** DTOs de aplicación para el rail ROP (Result<Success, DomainError>). */

export type Success = 
  | SessionDto
  | UserDto
  | AdminUserProvisionDto
  | CategoryDto
  | ProductDto
  | BannerDto
  | CartDto
  | CheckoutDto
  | OrderDto
  | PagedProductsDto
  | PagedOrdersDto
  | StockAdjustmentDto
  | UploadUrlDto;

/** DTO de sesión para el rail ROP. */
export interface SessionDto {
  readonly access_token: string;
  readonly expires_at: string;
  readonly user: UserResponseDto;
}

/** DTO de usuario para el rail ROP. */
export interface UserDto {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly must_change_password: boolean;
  readonly phone: string | null;
}

/** DTO de provision de admin para el rail ROP. */
export interface AdminUserProvisionDto {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly must_change_password: boolean;
  readonly activation_expires_at: string;
}

/** DTO de categoría para el rail ROP. */
export interface CategoryDto {
  readonly id: string;
  readonly name: string;
  readonly image: ImageResponseDto;
  readonly version: number;
}

/** DTO de producto para el rail ROP. */
export interface ProductDto {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly regular_price_cop: bigint;
  readonly sale_price_cop?: bigint | null;
  readonly stock_on_hand: number;
  readonly deleted_at?: Date | null;
}

/** DTO de banner para el rail ROP. */
export interface BannerDto {
  readonly id: string;
  readonly key: string;
  readonly url: URL;
  readonly alt_text: string;
  readonly position: number;
  readonly active: boolean;
}

/** DTO de carrito para el rail ROP. */
export interface CartDto {
  readonly items: CartItemResponseDto[];
  readonly subtotal_cop: bigint;
  readonly delivery_fee_cop: bigint;
  readonly tax_rate_basis_points: number;
  readonly total_cop: bigint;
}

/** DTO de checkout para el rail ROP. */
export interface CheckoutDto {
  readonly order_id: string;
  readonly payment_id?: string | null;
  readonly status: CartStatus;
  readonly items_subtotal_cop: bigint;
  readonly delivery_fee_cop: bigint;
  readonly iva_cop: bigint;
  readonly total_cop: bigint;
}

/** DTO de pedido para el rail ROP. */
export interface OrderDto {
  readonly id: string;
  readonly order_number: string;
  readonly status: OrderStatus;
  readonly items: OrderItemResponseDto[];
}

/** DTO paginado de productos para el rail ROP. */
export interface PagedProductsDto {
  readonly items: ProductDto[];
  readonly page: PageMetaDto;
}

/** DTO paginado de pedidos para el rail ROP. */
export interface PagedOrdersDto {
  readonly items: OrderDto[];
  readonly page: PageMetaDto;
}

/** DTO de ajuste de stock para el rail ROP. */
export interface StockAdjustmentDto {
  readonly id: string;
  readonly product_id: string;
  readonly quantity_delta: number;
  readonly reason: string;
  readonly actor_user_id?: string | null;
}

/** DTO de URL de subida para el rail ROP. */
export interface UploadUrlDto {
  readonly s3_url: URL;
  readonly expires_at: Date;
}

/** Meta de paginación para el rail ROP. */
export interface PageMetaDto {
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

/** Tipos compartidos (exportados desde schemas.ts). */
export type UserRole = import('../schemas').Role;
export type CartStatus = import('../schemas').CartStatus;
export type OrderStatus = import('../schemas').OrderStatus;

/** Respuesta de usuario (OpenAPI, duplicada para uso interno). */
export interface UserResponseDto {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly must_change_password: boolean;
  readonly phone: string | null;
}

/** Respuesta de imagen (OpenAPI, duplicada para uso interno). */
export interface ImageResponseDto {
  readonly key: string;
  readonly url: URL;
  readonly alt_text: string;
  readonly position: number;
}

/** Respuesta de ítem de carrito (OpenAPI, duplicada para uso interno). */
export interface CartItemResponseDto {
  readonly product_id: string;
  readonly quantity: number;
  readonly unit_price_cop: bigint;
}

/** Respuesta de ítem de pedido (OpenAPI, duplicada para uso interno). */
export interface OrderItemResponseDto {
  readonly product_id: string;
  readonly quantity: number;
  readonly unit_price_cop: bigint;
  readonly total_cop: bigint;
}
