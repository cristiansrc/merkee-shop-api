import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../../../cart-reservation/infrastructure/cart-prisma.service';
import {
  WebhookEventRepositoryPort,
  WebhookEventRecord,
  WebhookEventSaveParams,
  WebhookEventStatusValue,
} from '../../domain/ports/webhook-event-repository.port';

/**
 * Adapter Prisma de repositorio de eventos de webhook (infrastructure).
 *
 * Implementa WebhookEventRepositoryPort para persistencia de eventos
 * de webhook de proveedor con deduplicación por (provider, provider_event_id).
 *
 * La tabla `payment_webhook_events` tiene UNIQUE(provider, provider_event_id)
 * que garantiza la deduplicación a nivel de base de datos.
 */
@Injectable()
export class PrismaWebhookEventRepositoryAdapter implements WebhookEventRepositoryPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findByProviderAndEventId(
    provider: string,
    providerEventId: string,
  ): Promise<WebhookEventRecord | null> {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider as 'WOMPI' | 'MERCADO_PAGO',
          providerEventId,
        },
      },
    });

    if (!event) return null;

    return {
      id: event.id,
      provider: event.provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.payload,
      status: event.status as WebhookEventStatusValue,
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
    };
  }

  async save(params: WebhookEventSaveParams): Promise<WebhookEventRecord> {
    const event = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: params.provider as 'WOMPI' | 'MERCADO_PAGO',
        providerEventId: params.providerEventId,
        eventType: params.eventType,
        payload: params.payload as any,
        status: params.status as any,
      },
    });

    return {
      id: event.id,
      provider: event.provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.payload,
      status: event.status as WebhookEventStatusValue,
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
    };
  }

  async updateStatus(
    eventId: string,
    status: WebhookEventStatusValue,
    processedAt?: Date,
  ): Promise<void> {
    await this.prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: status as any,
        processedAt: processedAt ?? (status === 'PROCESSED' ? new Date() : undefined),
      },
    });
  }
}
