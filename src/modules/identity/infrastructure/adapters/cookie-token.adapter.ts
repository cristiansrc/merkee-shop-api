import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { CookieTokenPort } from '../../domain/ports/cookie-token.port';

/**
 * Adapter de salida de token opaco (cookie).
 *
 * Genera tokens aleatorios de 32 bytes (64 caracteres hex) y los
 * hashea con SHA-256 para almacenamiento. Nunca se almacena el token
 * en claro.
 */
@Injectable()
export class CookieTokenAdapter implements CookieTokenPort {
  generate(): string {
    return randomBytes(32).toString('hex');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
