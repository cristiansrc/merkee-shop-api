/**
 * Contrato OpenAPI tipado (MSF-API-003).
 *
 * Punto de entrada único para los tipos de transporte (schemas y parámetros),
 * los DTOs de aplicación (`Success` del rail ROP), el mapa de trazabilidad
 * operationId→contrato y los validadores sintácticos de transporte.
 *
 * Este directorio es TypeScript puro (sin NestJS/Prisma/HTTP): define la forma
 * del contrato y su validación estructural; la validación semántica de dominio
 * pertenece al dominio y se devuelve por el rail `Failure` de `Result`.
 */

export * from './schemas';
export * from './parameters';
export { findOperation, OPERATIONS, type OperationContract, type HttpMethod } from './operation-map';
export type {
  Success,
  SessionDto,
  UserDto,
  AdminUserProvisionDto,
  CategoryDto,
  ProductDto,
  BannerDto,
  CartDto,
  CheckoutDto,
  OrderDto,
  PagedProductsDto,
  PagedOrdersDto,
  StockAdjustmentDto,
  UploadUrlDto,
  PageMetaDto,
  UserRole as ApplicationUserRole,
  CartStatus as ApplicationCartStatus,
  OrderStatus as ApplicationOrderStatus,
  UserResponseDto,
  ImageResponseDto,
  CartItemResponseDto,
  OrderItemResponseDto,
} from './application/dto';
export * from './validation/validators';
export * from './validation/request-validators';
export * from './validation/header-validators';
