import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { CartPrismaService } from '../cart-prisma.service';
import { CartSessionResolverPort, CartSessionResolution } from '../../domain/ports/cart-session-resolver.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { CART_TOKENS } from '../../cart-reservation.tokens';
import { JwtPort } from '../../../identity/domain/ports/jwt.port';
import { IDENTITY_TOKENS } from '../../../identity/identity.tokens';
import { isSuccess } from '../../../../shared/domain/result';
import { buildErrorResponse } from '../../../../shared/http/result-projector';
import { authenticationRequired } from '../../../identity/domain/identity-errors';

/** Nombre de la cookie de sesión de carrito de invitado. */
const CART_SESSION_COOKIE = 'merkee_cart_session';

/** TTL de sesión GUEST en minutos (consistente con reserva ACTIVE). */
const GUEST_SESSION_TTL_MINUTES = 10;

/** Extrae el token de un header `Authorization: Bearer <token>`. */
function extractBearerToken(authorization: string): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

/**
 * Adapter de resolución de sesión del carrito (infrastructure).
 *
 * Implementa `CartSessionResolverPort` usando:
 * - `JwtPort` para verificar Bearer tokens.
 * - `CartPrismaService` para crear sesiones GUEST.
 * - `ClockPort` para obtener el tiempo actual.
 *
 * Patrón: el adapter orquesta los puertos de salida y devuelve un
 * resultado que el controller consume directamente.
 */
@Injectable()
export class CartSessionResolverAdapter implements CartSessionResolverPort {
  constructor(
    @Inject(IDENTITY_TOKENS.JWT) private readonly jwt: JwtPort,
    @Inject(CART_TOKENS.CLOCK) private readonly clock: ClockPort,
    private readonly prisma: CartPrismaService,
  ) {}

  async resolve(
    cookieSessionId: string | undefined,
    authorizationHeader: string | undefined,
    path: string,
  ): Promise<CartSessionResolution> {
    const traceId = `cart-session-${Date.now()}`;

    // 1. Cookie presente → reutilizar sesión existente
    if (typeof cookieSessionId === 'string' && cookieSessionId.length > 0) {
      return { sessionId: cookieSessionId };
    }

    // 2. Bearer token presente → verificar JWT
    if (typeof authorizationHeader === 'string' && authorizationHeader.length > 0) {
      const token = extractBearerToken(authorizationHeader);
      if (!token) {
        const body = buildErrorResponse(authenticationRequired(), path, traceId);
        throw new UnauthorizedException(body);
      }

      const result = await this.jwt.verify(token);
      if (!isSuccess(result)) {
        const body = buildErrorResponse(result.error, path, traceId);
        throw new UnauthorizedException(body);
      }

      return { sessionId: result.value.session_id };
    }

    // 3. Anónimo → crear sesión GUEST + cookie opaca HttpOnly
    return this.createGuestSession();
  }

  /**
   * Crea una sesión GUEST en la DB y devuelve la resolución con
   * la cookie opaca HttpOnly que el controller debe enviar.
   *
   * La cookie almacena el UUID de la sesión (ya opaco y no-guessable).
   * El campo `refreshTokenHash` recibe un hash aleatorio para satisfacer
   * la restricción NOT NULL + UNIQUE del schema; no se usa para lookup
   * de sesiones de carrito (el puerto SessionLookupPort.findById usa el ID).
   */
  private async createGuestSession(): Promise<CartSessionResolution> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MINUTES * 60 * 1000);

    // Hash aleatorio para el constraint NOT NULL + UNIQUE (no se usa en cart)
    const dummyHash = createHash('sha256')
      .update(randomBytes(32))
      .digest('hex');

    const session = await this.prisma.session.create({
      data: {
        sessionKind: 'GUEST',
        refreshTokenHash: dummyHash,
        expiresAt,
        lastActivityAt: now,
      },
    });

    return {
      sessionId: session.id,
      cookie: {
        name: CART_SESSION_COOKIE,
        value: session.id,
        options: {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          expires: expiresAt,
        },
      },
    };
  }
}
