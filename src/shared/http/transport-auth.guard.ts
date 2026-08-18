/**
 * Guard de autenticación de transporte básica (MSF-API-002).
 *
 * Verifica únicamente la presencia de credenciales de transporte (p. ej.
 * header `Authorization: Bearer <token>` o cookie de sesión). NO implementa
 * autenticación de negocio completa (fuera de alcance): solo rechaza con
 * `401 AUTHENTICATION_REQUIRED` cuando falta el token de transporte.
 *
 * La autenticación/identidad real se resolverá en tareas posteriores de
 * `identity`; este guard centraliza el rechazo de transporte.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/** Código de transporte para autenticación requerida. */
export const TRANSPORT_CODE_AUTH_REQUIRED = 'AUTHENTICATION_REQUIRED';

@Injectable()
export class TransportAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization: unknown = request?.headers?.['authorization'];
    const hasBearer =
      typeof authorization === 'string' &&
      /^Bearer\s+\S+$/i.test(authorization.trim());

    if (!hasBearer) {
      const body = {
        timestamp: new Date().toISOString(),
        status: 401,
        error: 'Unauthorized',
        code: TRANSPORT_CODE_AUTH_REQUIRED,
        message: 'Se requiere autenticación.',
        path: '/',
        trace_id: '',
      };
      throw new UnauthorizedException(body);
    }
    return true;
  }
}
