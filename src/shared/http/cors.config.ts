/**
 * Configuración CORS del monolito Merkee Shop.
 *
 * Allowlist estricta de origins permitidos. No se permite `*` con credentials
 * ni se reflejan origins arbitrarios. La lista es configurable vía variable
 * de entorno `CORS_ALLOWED_ORIGINS` (separada por comas) para flexibilidad
 * entre ambientes, pero los valores por defecto cubren los frontends
 * conocidos del ecosistema Merkee.
 *
 * Headers de tracing se incluyen explícitamente para soportar la
 * propagación de `x-request-id` entre servicios frontales y backend.
 */

/** Origins de producción conocidos del ecosistema Merkee. */
const PRODUCTION_ORIGINS = [
  'https://www.merkee.shop',
  'https://admin.merkee.shop',
] as const;

/** Headers permitidos en requests CORS (incluye tracing y retry/idempotencia). */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Idempotency-Key',
  'If-Match',
  'Origin',
  'X-CSRF-Token',
  'x-request-id', // Tracing header del proyecto
] as const;

/** Métodos HTTP permitidos. */
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

/**
 * Resuelve la lista de origins CORS permitidos.
 *
 * Prioriza la variable de entorno `CORS_ALLOWED_ORIGINS` (separada por comas).
 * Si no está definida o está vacía, usa los origins de producción conocidos.
 *
 * @returns Array de origins permitidos, sin duplicados ni strings vacíos.
 */
function resolveAllowedOrigins(): string[] {
  const envValue = process.env.CORS_ALLOWED_ORIGINS;
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    const parsed = envValue
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [...PRODUCTION_ORIGINS];
}

/**
 * Función callback para `app.enableCors({ origin: ... })` de NestJS.
 *
 * Valida el origin del request contra la allowlist y responde con los headers
 * CORS apropiados. No refleja origins no permitidos.
 *
 * @param origin - El header `Origin` del request (puede ser `undefined` en
 *   requests no-CORS como Same-Origin o server-to-server).
 * @param callback - Función de callback de Express CORS.
 */
export function originCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  const allowedOrigins = resolveAllowedOrigins();

  // Requests sin Origin (Same-Origin, server-to-server, curl) se permiten.
  if (typeof origin === 'undefined' || origin === null) {
    callback(null, true);
    return;
  }

  // Validación estricta: solo origins en la allowlist.
  const isAllowed = allowedOrigins.includes(origin);

  if (isAllowed) {
    callback(null, true);
  } else {
    // Rechazo silencioso: no se revela la allowlist al cliente.
    callback(null, false);
  }
}

/**
 * Opciones CORS para `app.enableCors()` en NestJS.
 *
 * Uso:
 * ```typescript
 * import { corsOptions } from './shared/http/cors.config';
 * app.enableCors(corsOptions);
 * ```
 */
export const corsOptions = {
  origin: originCallback,
  credentials: true,
  methods: Array.from(ALLOWED_METHODS),
  allowedHeaders: Array.from(ALLOWED_HEADERS),
  exposedHeaders: ['x-request-id'] as string[],
  maxAge: 86400, // 24 horas cache para preflight
};
