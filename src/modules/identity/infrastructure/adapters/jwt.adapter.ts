import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtPort, JwtPayload } from '../../domain/ports/jwt.port';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure, sessionNotFoundOrExpired } from '../../domain/identity-errors';

/** Duración del JWT de acceso: 10 minutos. */
const ACCESS_TOKEN_EXPIRY = '10m';

/**
 * Adapter de salida de JWT (jsonwebtoken).
 *
 * Firma tokens HS256 con una clave secreta de entorno. Los errores de
 * firma y verificación se traducen al rail ROP en el límite del adapter
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
@Injectable()
export class JwtAdapter implements JwtPort {
  private readonly logger = new Logger(JwtAdapter.name);
  private readonly secret: string;

  constructor() {
    const configuredSecret = process.env.JWT_SECRET;
    if (
      process.env.NODE_ENV === 'production' &&
      (!configuredSecret || Buffer.byteLength(configuredSecret, 'utf8') < 32)
    ) {
      throw new Error('JWT_SECRET must be configured with at least 32 bytes in production.');
    }

    this.secret = configuredSecret || 'merkee-shop-dev-secret-change-in-production';
    if (!configuredSecret) {
      // Solo advertir en desarrollo; no exponer el secreto en logs
      console.warn(
        'JWT_SECRET no configurado; usando únicamente el valor por defecto de desarrollo.',
      );
    }
  }

  async sign(payload: JwtPayload): Promise<Result<string, DomainError>> {
    try {
      const token = jwt.sign(payload as object, this.secret, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      });
      return ok(token);
    } catch (error) {
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.warn(`JWT sign failed (type=${errorType})`);
      return fail(technicalFailure());
    }
  }

  async verify(token: string): Promise<Result<JwtPayload, DomainError>> {
    try {
      const decoded = jwt.verify(token, this.secret) as jwt.JwtPayload;
      return ok({
        sub: decoded.sub!,
        session_id: decoded.session_id,
        role: decoded.role,
      });
    } catch (error) {
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.warn(`JWT verification failed (type=${errorType})`);
      if (
        error instanceof jwt.TokenExpiredError ||
        error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.NotBeforeError
      ) {
        return fail(sessionNotFoundOrExpired());
      }
      return fail(technicalFailure());
    }
  }
}
