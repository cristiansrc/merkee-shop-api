/**
 * Resolución de URL pública de media (CloudFront privado → alias DNS).
 *
 * Los buckets de media son privados (OAC) y el catálogo persiste únicamente
 * el `image_key` del objeto. Para construir la URL pública estable de lectura
 * se antepone la base configurable y se conserva la estructura de segmentos
 * del key (`media/2026/...`).
 *
 * No se devuelven URLs prefirmadas GET ni credenciales: solo la URL pública
 * de CloudFront (`https://images.merkee.shop/{image_key}` por defecto).
 *
 * Este archivo pertenece a la capa de transporte (adapter HTTP): puede leer
 * `process.env`. El dominio/aplicación nunca construyen URLs HTTP.
 */

/** Base URL pública por defecto de media (alias DNS de CloudFront). */
export const DEFAULT_MEDIA_PUBLIC_BASE_URL = 'https://images.merkee.shop';

/**
 * Resuelve la URL pública de media para un `imageKey`.
 *
 * - Usa `MEDIA_PUBLIC_BASE_URL` si está definida y no vacía; si no, el
 *   default seguro `https://images.merkee.shop`.
 * - Conserva los segmentos del key (`media/2026/...`) sin convertir `/` en
 *   `%2F` innecesariamente.
 * - Codifica caracteres peligrosos dentro de cada segmento (espacios, `#`,
 *   `?`, `&`, `%`, etc.) con `encodeURIComponent`.
 * - Devuelve `''` si el key está vacío (sin key → sin URL).
 *
 * @param imageKey Clave de objeto en el bucket privado (ej. `media/2026/08/20/uuid.jpg`).
 * @returns URL pública `https://images.merkee.shop/{imageKey}` o `''`.
 */
export function resolveMediaPublicUrl(imageKey: string): string {
  if (!imageKey) {
    return '';
  }
  return `${resolveMediaPublicBaseUrl()}/${encodeImageKey(imageKey)}`;
}

/** Resuelve la base URL pública de media desde environment o default seguro. */
function resolveMediaPublicBaseUrl(): string {
  const raw = process.env.MEDIA_PUBLIC_BASE_URL;
  const candidate =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim()
      : DEFAULT_MEDIA_PUBLIC_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

/**
 * Codifica un `imageKey` conservando `/` como separador de segmentos.
 *
 * Cada segmento se codifica con `encodeURIComponent` (que no toca
 * `A-Za-z0-9-_.!~*'()`), de modo que caracteres peligrosos como espacios,
 * `#`, `?`, `&` o `%` se escapan sin afectar la estructura de rutas del key.
 */
function encodeImageKey(imageKey: string): string {
  return imageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
