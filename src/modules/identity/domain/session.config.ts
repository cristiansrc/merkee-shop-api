/**
 * Configuración de sesión del módulo `identity`.
 *
 * Constantes derivadas de la decisión de producto aprobada por el usuario
 * (2026-08-20): inactividad máxima de sesión de 30 minutos para ambos roles
 * (`admin` y `cliente`), manteniendo el JWT de acceso en un máximo de
 * 10 minutos.
 *
 * - `SESSION_INACTIVITY_TTL_MS`: ventana de inactividad de una sesión
 *   autenticada (refresh token opaco hashado). Se renueva en cada login,
 *   refresh y rotación de cookie (p. ej. password-change). Es distinta del
 *   TTL de reserva ACTIVE del carrito, que permanece en 10 minutos
 *   (Master Spec AC-11 / `cart-reaper.config.ts`).
 * - El JWT de acceso (`ACCESS_TOKEN_EXPIRY` en `jwt.adapter.ts`) permanece
 *   en 10 minutos; no forma parte de esta constante.
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP.
 */

/** Duración máxima de inactividad de una sesión autenticada: 30 minutos. */
export const SESSION_INACTIVITY_TTL_MS = 30 * 60 * 1000;
