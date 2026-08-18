/**
 * Tokens de inyección de dependencias del módulo `media` (MSF-CAT-001).
 *
 * NestJS no permite usar interfaces TypeScript como tokens de inyección
 * (no existen en runtime). Estos strings constantes permiten que el
 * contenedor DI resuelva las dependencias por nombre.
 */
export const MEDIA_TOKENS = {
  // Puertos de salida (adapters)
  MEDIA_STORAGE: 'MEDIA_MEDIA_STORAGE',
  MEDIA_IDEMPOTENCY: 'MEDIA_MEDIA_IDEMPOTENCY',
  USER_LOOKUP: 'MEDIA_USER_LOOKUP',

  // Casos de uso
  CREATE_UPLOAD_URL_USE_CASE: 'MEDIA_CREATE_UPLOAD_URL_USE_CASE',

  // Configuración
  PRESIGNED_URL_TTL_SECONDS: 'MEDIA_PRESIGNED_URL_TTL_SECONDS',
} as const;
