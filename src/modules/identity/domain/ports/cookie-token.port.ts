/**
 * Puerto de salida de token opaco (cookie) del módulo `identity`.
 *
 * Genera tokens aleatorios para el refresh token HttpOnly y los hashea
 * para almacenamiento. La implementación concreta (crypto) vive en
 * infrastructure.
 *
 * Los métodos son síncronos y no pueden fallar (generación de bytes
 * aleatorios y hash SHA-256 son operaciones deterministas seguras);
 * por lo tanto no devuelven `Result`.
 */
export interface CookieTokenPort {
  /** Genera un token opaco aleatorio (para enviar en cookie). */
  generate(): string;
  /** Hashea un token para almacenamiento (nunca se almacena en claro). */
  hash(token: string): string;
}
