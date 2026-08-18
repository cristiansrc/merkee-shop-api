/**
 * Tipos de parámetros de transporte (headers, query y path) alineados con el
 * contrato OpenAPI `docs/api/openapi.yaml` `components/parameters`
 * (MSF-API-003).
 *
 * Este archivo es TypeScript puro (sin NestJS/Prisma/HTTP). Define la forma
 * tipada de los parámetros que los controllers/adapters de entrada leen y
 * validan sintácticamente antes de construir un Command.
 */

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * `Idempotency-Key`: UUID estable único para la mutación prevista
 * (`components/parameters/IdempotencyKey`). Requerido en las mutaciones
 * idempotentes.
 */
export type IdempotencyKeyHeader = string;

/**
 * `If-Match`: `version` esperada para el bloqueo optimista de las
 * actualizaciones de categoría/producto/banner. Es una cadena numérica
 * (`pattern: '^[0-9]+$'`). No se usa en los ajustes de stock.
 */
export type IfMatchHeader = string;

/** Header de firma del webhook de Wompi (`X-Event-Signature`). */
export type WompiEventSignatureHeader = string;

/** Header de ID de evento del webhook de Wompi (`X-Event-Id`). */
export type WompiEventIdHeader = string;

/** Header de ID de solicitud del webhook de Mercado Pago (`X-Request-Id`). */
export type MercadoPagoRequestIdHeader = string;

/** Header de firma del webhook de Mercado Pago (`X-Signature`). */
export type MercadoPagoSignatureHeader = string;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** `category_id` (query): filtro por categoría en `GET /products`. */
export type CategoryIdQuery = string;

/** `q` (query): búsqueda de productos, longitud 2..100. */
export type SearchQuery = string;

/** `page` (query): página de resultados, mínimo 1, default 1. */
export type PageQuery = number;

/** `size` (query): tamaño de página, 1..100, default 20. */
export type SizeQuery = number;

/** `status` (query): filtro por estado de orden en `GET /admin/orders`. */
export type OrderStatusQuery = import('./schemas').OrderStatus;

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

/** `productId` (path): UUID de producto. */
export type ProductIdPath = string;

/** `categoryId` (path): UUID de categoría. */
export type CategoryIdPath = string;

/** `bannerId` (path): UUID de banner. */
export type BannerIdPath = string;

/** `orderId` (path): UUID de orden. */
export type OrderIdPath = string;

// ---------------------------------------------------------------------------
// Agrupaciones de parámetros por operación
// ---------------------------------------------------------------------------

/** Parámetros de paginación (`page`, `size`). */
export interface PaginationParams {
  readonly page?: PageQuery;
  readonly size?: SizeQuery;
}

/** Parámetros de listado público de productos. */
export interface ListProductsParams extends PaginationParams {
  readonly category_id?: CategoryIdQuery;
  readonly q?: SearchQuery;
}

/** Parámetros de listado admin de órdenes. */
export interface AdminListOrdersParams extends PaginationParams {
  readonly status?: OrderStatusQuery;
}
