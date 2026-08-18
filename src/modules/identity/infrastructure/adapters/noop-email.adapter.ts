import { Injectable, Logger } from '@nestjs/common';
import type { EmailPort } from '../../domain/ports/email.port';
import { Result, ok } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Adaptador noop de envío de emails (v1).
 *
 * Registra únicamente que se solicitó un envío. **Nunca** registra
 * dirección de correo, token, hash ni ningún dato identificable (PII).
 * En producción se reemplazará por un adaptador de outbox/SES/SMTP que
 * persista el evento en la tabla `outbox_events` dentro de la misma
 * transacción del caso de uso.
 *
 * ROP: retorna `Result<void, DomainError>` para que las excepciones
 * técnicas del adaptador concreto se traduzcan antes de llegar al
 * use case. El noop siempre retorna Ok.
 *
 * Seguridad: el token en claro solo se entrega al `EmailPort` para
 * inclusión en el enlace del email; no se almacena, loguea, metrica
 * ni expone en response (Master Spec §ROP / ADR-017).
 */
@Injectable()
export class NoopEmailAdapter implements EmailPort {
  private readonly logger = new Logger(NoopEmailAdapter.name);

  async sendPasswordResetEmail(
    _to: string,
    _token: string,
  ): Promise<Result<void, DomainError>> {
    // intentionally empty — no logs, no PII, no token
    void this.logger;
    return ok(undefined);
  }
}
