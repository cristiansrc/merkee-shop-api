/**
 * Puerto de salida de resolución de sesión para el carrito (ADR-008).
 *
 * Resuelve la sesión del carrito a partir de los tres modos de acceso
 * soportados por OpenAPI: cookie de sesión, Bearer JWT y anónimo (guest).
 *
 * - Cookie → reutiliza sesión existente.
 * - Bearer → verifica firma JWT vía JwtPort y extrae session_id.
 * - Anónimo → crea sesión GUEST con cookie opaca.
 *
 * TypeScript puro: sin NestJS, Prisma ni HTTP.
 */

/** Opciones de la cookie de sesión de carrito. */
export interface CartSessionCookieOptions {
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict' | 'none';
  readonly path: string;
  readonly expires: Date;
}

/** Cookie que el controller debe enviar en la respuesta. */
export interface CartSessionCookie {
  readonly name: string;
  readonly value: string;
  readonly options: CartSessionCookieOptions;
}

/** Resultado de la resolución de sesión del carrito. */
export interface CartSessionResolution {
  readonly sessionId: string;
  /** Presente solo cuando se creó una nueva sesión GUEST. */
  readonly cookie?: CartSessionCookie;
}

/**
 * Puerto de resolución de sesión del carrito.
 *
 * El controller delega la lógica de: cookie → sesión, Bearer → JWT verify,
 * anónimo → crear GUEST + cookie. El puerto encapsula la dependencia de
 * JwtPort, repositorio de sesiones y generación de tokens opacos.
 */
export interface CartSessionResolverPort {
  /**
   * Resuelve la sesión del carrito desde el request HTTP.
   *
   * @param cookieSessionId - Valor de la cookie `merkee_cart_session` (si existe).
   * @param authorizationHeader - Header `Authorization` completo (si existe).
   * @param path - Path del request para errores.
   * @returns Resolución con sessionId y opcionalmente cookie a Set-Cookie.
   * @throws HttpException 401 si Bearer token inválido/expirado.
   */
  resolve(
    cookieSessionId: string | undefined,
    authorizationHeader: string | undefined,
    path: string,
  ): Promise<CartSessionResolution>;
}
