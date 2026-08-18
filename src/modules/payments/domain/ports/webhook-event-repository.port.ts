/**
 * Puerto de salida de repositorio de eventos de webhook (MSF-PAY-003).
 *
 * Persistencia y consulta de eventos de webhook de proveedor.
 * Deduplicación por (provider, provider_event_id) con UNIQUE.
 *
 * Este archivo es TypeScript puro: no importa NestJS, Prisma ni HTTP.
 */
export interface WebhookEventRepositoryPort {
  /**
   * Busca un evento de webhook por provider y provider_event_id.
   * Usado para deduplicación antes de persistir.
   */
  findByProviderAndEventId(
    provider: string,
    providerEventId: string,
  ): Promise<WebhookEventRecord | null>;

  /**
   * Persiste un evento de webhook con estado RECEIVED.
   * Lanza error si ya existe (violación de UNIQUE).
   */
  save(event: WebhookEventSaveParams): Promise<WebhookEventRecord>;

  /**
   * Actualiza el estado de un evento de webhook.
   */
  updateStatus(
    eventId: string,
    status: WebhookEventStatusValue,
    processedAt?: Date,
  ): Promise<void>;
}

/** Registro de evento de webhook (modelo de dominio). */
export interface WebhookEventRecord {
  readonly id: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string | null;
  readonly payload: unknown;
  readonly status: WebhookEventStatusValue;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
}

/** Parámetros para guardar un evento de webhook. */
export interface WebhookEventSaveParams {
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string | null;
  readonly payload: unknown;
  readonly status: WebhookEventStatusValue;
}

/** Estado de procesamiento de un evento de webhook. */
export type WebhookEventStatusValue = 'RECEIVED' | 'PROCESSED' | 'DUPLICATE' | 'FAILED';
