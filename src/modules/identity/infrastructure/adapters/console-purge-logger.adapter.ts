import { Injectable, Logger } from '@nestjs/common';
import { PurgeLoggerPort } from '../../domain/ports/purge-logger.port';

/**
 * Adapter de log estructurado de purga sin PII.
 *
 * Emite los eventos `idempotency_records.purge_completed` y
 * `idempotency_records.purge_failed` (ADR-018) sin incluir scope, claves,
 * cuerpos ni ningún dato personal.
 */
@Injectable()
export class ConsolePurgeLoggerAdapter implements PurgeLoggerPort {
  private readonly logger = new Logger('IdempotencyPurge');

  info(event: string, fields?: Readonly<Record<string, unknown>>): void {
    this.logger.log({ event, ...fields });
  }

  error(event: string, fields?: Readonly<Record<string, unknown>>): void {
    this.logger.error({ event, ...fields });
  }
}
