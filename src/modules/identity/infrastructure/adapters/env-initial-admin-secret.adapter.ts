import { Injectable } from '@nestjs/common';
import { InitialAdminSecretPort } from '../../domain/ports/initial-admin-secret.port';

/**
 * Nombre de la variable de entorno que referencia la contraseña inicial del
 * admin. Nunca se versiona un valor real; solo se documenta el nombre.
 */
export const INITIAL_ADMIN_PASSWORD_ENV = 'INITIAL_ADMIN_PASSWORD';

/**
 * Adapter de salida de secreto del admin inicial (variable de entorno).
 *
 * Lee la contraseña inicial desde una variable de entorno no versionada
 * (o, en despliegue, inyectada por el task role desde Secrets Manager). Si la
 * variable está ausente o vacía, devuelve `null` para que el bootstrap falle
 * de forma segura antes de crear usuario (ADR-010).
 *
 * Nunca registra el valor leído.
 */
@Injectable()
export class EnvInitialAdminSecretAdapter implements InitialAdminSecretPort {
  getInitialAdminPassword(): string | null {
    const value = process.env[INITIAL_ADMIN_PASSWORD_ENV];
    return value && value.trim().length > 0 ? value : null;
  }
}
