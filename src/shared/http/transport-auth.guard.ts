/**
 * Guard de autenticación de transporte (MSF-API-002 / DEC-02).
 *
 * Verifica la firma y expiración del JWT de acceso presente en el header
 * `Authorization: Bearer <token>` invocando `JwtPort.verify` y, en éxito,
 * asigna `req.user = { id, sessionId, role }` para que los controllers
 * resuelvan el actor autenticado vía `getActor(req)`.
 *
 * El puerto `JwtPort` se inyecta por el símbolo `IDENTITY_TOKENS.JWT`
 * (continuidad de ADR-017: el guard consume el puerto, nunca el adapter
 * concreto). Los `Result.fail` se proyectan a `ApiErrorResponse` reutilizando
 * `buildErrorResponse` (result-projector) sin filtrar causas/PII.
 */

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPort, JwtPayload } from '../../modules/identity/domain/ports/jwt.port';
import { IDENTITY_TOKENS } from '../../modules/identity/identity.tokens';
import { authenticationRequired } from '../../modules/identity/domain/identity-errors';
import { isSuccess } from '../domain/result';
import { buildErrorResponse } from './result-projector';

/** Código de transporte para autenticación requerida. */
export const TRANSPORT_CODE_AUTH_REQUIRED = 'AUTHENTICATION_REQUIRED';

/** Actor autenticado extraído del JWT y asignado a `req.user`. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly sessionId: string;
  readonly role: JwtPayload['role'];
}

/** Extrae el token de un header `Authorization: Bearer <token>`. */
function extractBearerToken(authorization: unknown): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

@Injectable()
export class TransportAuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_TOKENS.JWT) private readonly jwt: JwtPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization: unknown = request?.headers?.['authorization'];
    const token = extractBearerToken(authorization);
    const path: string =
      (request?.originalUrl ?? request?.url ?? '/') as string;
    const traceId: string =
      typeof request?.headers?.['x-request-id'] === 'string'
        ? (request.headers['x-request-id'] as string)
        : '';

    if (!token) {
      const body = buildErrorResponse(authenticationRequired(), path, traceId);
      throw new HttpException(body, body.status);
    }

    const result = await this.jwt.verify(token);
    if (!isSuccess(result)) {
      const body = buildErrorResponse(result.error, path, traceId);
      throw new HttpException(body, body.status);
    }

    const payload = result.value;
    (request as Request & { user?: AuthenticatedUser }).user = {
      id: payload.sub,
      sessionId: payload.session_id,
      role: payload.role,
    };
    return true;
  }
}
