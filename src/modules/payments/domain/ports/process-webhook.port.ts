/**
 * Puerto de entrada (caso de uso) de procesamiento de webhook de pago (MSF-PAY-003).
 *
 * Procesa únicamente webhooks autenticados y hace transición de pago/stock
 * idempotente. La firma se valida en el controller antes de invocar este caso.
 *
 * Este archivo es TypeScript puro: no importa NestJS, Prisma ni HTTP.
 */
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

export interface ProcessWebhookUseCase {
  execute(
    command: ProcessWebhookCommand,
  ): Promise<Result<ProcessWebhookResult, DomainError>>;
}

/**
 * Comando de entrada del caso de uso.
 *
 * La firma ya fue validada en el controller (adapter de entrada).
 * El caso de uso decide deduplicación, transición y compensación.
 */
export interface ProcessWebhookCommand {
  /** Proveedor de pago ('WOMPI' | 'MERCADO_PAGO'). */
  readonly provider: 'WOMPI' | 'MERCADO_PAGO';
  /** ID del evento según el proveedor (deduplicación). */
  readonly providerEventId: string;
  /** Tipo de evento del proveedor (ej: 'transaction.updated'). */
  readonly eventType: string | null;
  /** Payload parseado del body del webhook. */
  readonly payload: Record<string, unknown>;
}

/**
 * Resultado de éxito del procesamiento.
 *
 * - `accepted`: evento nuevo procesado exitosamente.
 * - `duplicate`: evento duplicado, procesado como no-op idempotente.
 */
export interface ProcessWebhookResult {
  readonly outcome: 'accepted' | 'duplicate';
}
