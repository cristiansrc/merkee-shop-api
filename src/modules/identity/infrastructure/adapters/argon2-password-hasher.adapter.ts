import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

/**
 * Implementación del puerto `PasswordHasherPort` usando Argon2id.
 *
 * Captura excepciones técnicas de argon2 en su límite, las registra
 * sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 * La aplicación nunca captura excepciones técnicas: solo recibe el rail `Result`.
 */
@Injectable()
export class Argon2PasswordHasherAdapter implements PasswordHasherPort {
  private readonly logger = new Logger(Argon2PasswordHasherAdapter.name);

  async hash(password: string): Promise<Result<string, DomainError>> {
    try {
      const result = await argon2.hash(password, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      return ok(String(result));
    } catch (error) {
      this.logger.warn(`argon2.hash failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async verify(password: string, hash: string): Promise<Result<boolean, DomainError>> {
    try {
      const result = await argon2.verify(hash, password);
      return ok(result);
    } catch (error) {
      this.logger.warn(`argon2.verify failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }
}
