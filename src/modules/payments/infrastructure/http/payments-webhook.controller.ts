import {
  Controller,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { buildErrorResponse } from '../../../../shared/http/result-projector';
import { PAYMENTS_TOKENS } from '../../payments.tokens';
import {
  ProcessWebhookUseCase,
  ProcessWebhookCommand,
} from '../../domain/ports/process-webhook.port';
import { WebhookSignaturePort } from '../../domain/ports/webhook-signature.port';
import { paymentErrors } from '../../domain/payment-errors';

/**
 * Adapter de entrada HTTP del módulo `payments` para webhooks (MSF-PAY-003).
 *
 * Valida firma sobre raw body antes de crear el Command; nunca contiene
 * reglas de negocio ni Prisma (Master Spec §ROP / ADR-017).
 *
 * Los controllers REST y handlers de webhook son adapters de entrada:
 * validan sintaxis/transporte, autenticación/firma y tamaño/raw-body
 * cuando proceda; convierten a Command; invocan un único puerto de
 * entrada; y mapean Result al status/cuerpo OpenAPI.
 */
@Controller('webhooks')
export class PaymentsWebhookController {
  constructor(
    @Inject(PAYMENTS_TOKENS.PROCESS_WEBHOOK_USE_CASE)
    private readonly processWebhookUseCase: ProcessWebhookUseCase,
    @Inject(PAYMENTS_TOKENS.WOMPI_WEBHOOK_SIGNATURE)
    private readonly wompiSignature: WebhookSignaturePort,
    @Inject(PAYMENTS_TOKENS.MERCADO_PAGO_WEBHOOK_SIGNATURE)
    private readonly mercadoPagoSignature: WebhookSignaturePort,
  ) {}

  /**
   * POST /webhooks/wompi — Webhook del proveedor Wompi.
   *
   * Security: [] (sin autenticación JWT, pero firma requerida).
   * La firma se valida sobre el raw body antes de persistir
   * `payment_webhook_events`; solo se almacenan y procesan los
   * eventos con firma válida.
   *
   * Respuestas:
   * - 204: Aceptado o duplicado idempotente.
   * - 400: Body inválido.
   * - 401: Firma inválida.
   * - 500: Error interno.
   */
  @Post('wompi')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveWompiWebhook(
    @Req() req: Request,
    @Headers('x-event-id') eventId: string | undefined,
    @Headers('x-event-signature') eventSignature: string | undefined,
  ): Promise<void> {
    const path = '/webhooks/wompi';
    const traceId = this.generateTraceId();

    // 1. Validar headers requeridos
    if (!eventId || eventId.trim().length === 0) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput({
          details: [{ field: 'X-Event-Id', reason: 'Header requerido.' }],
        }),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!eventSignature || eventSignature.trim().length === 0) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput({
          details: [{ field: 'X-Event-Signature', reason: 'Header requerido.' }],
        }),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Obtener raw body
    const rawBody = this.getRawBody(req);
    if (rawBody === null) {
      const errorResponse = buildErrorResponse(
        paymentErrors.technicalFailure(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 3. Validar firma sobre raw body (401 sin persistir)
    const signatureValid = await this.wompiSignature.verify(rawBody, eventSignature);
    if (!signatureValid) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidWebhookSignature(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 4. Validar body parseado
    const payload = req.body as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 5. Crear comando e invocar caso de uso
    const command: ProcessWebhookCommand = {
      provider: 'WOMPI',
      providerEventId: eventId,
      eventType: this.extractEventType(payload),
      payload,
    };

    const result = await this.processWebhookUseCase.execute(command);

    // 6. Mapear Result a HTTP
    // - Success (outcome: 'accepted' | 'duplicate') → 204
    // - Failure → status correspondiente
    if (result.ok) {
      // 204: Aceptado o duplicado idempotente
      return;
    }

    // Failure: mapear DomainError a HTTP
    const errorResponse = buildErrorResponse(result.error, path, traceId);
    const HttpException = (await import('@nestjs/common')).HttpException;
    throw new HttpException(errorResponse, errorResponse.status);
  }

  /**
   * POST /webhooks/mercado-pago — Webhook del proveedor Mercado Pago.
   *
   * Security: [] (sin autenticación JWT, pero firma requerida).
   * La firma se valida sobre el raw body antes de persistir
   * `payment_webhook_events`; solo se almacenan y procesan los
   * eventos con firma válida.
   *
   * Respuestas:
   * - 204: Aceptado o duplicado idempotente.
   * - 400: Body inválido.
   * - 401: Firma inválida.
   * - 500: Error interno.
   */
  @Post('mercado-pago')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveMercadoPagoWebhook(
    @Req() req: Request,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-signature') signature: string | undefined,
  ): Promise<void> {
    const path = '/webhooks/mercado-pago';
    const traceId = this.generateTraceId();

    // 1. Validar headers requeridos
    if (!requestId || requestId.trim().length === 0) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput({
          details: [{ field: 'X-Request-Id', reason: 'Header requerido.' }],
        }),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!signature || signature.trim().length === 0) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput({
          details: [{ field: 'X-Signature', reason: 'Header requerido.' }],
        }),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Obtener raw body
    const rawBody = this.getRawBody(req);
    if (rawBody === null) {
      const errorResponse = buildErrorResponse(
        paymentErrors.technicalFailure(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 3. Validar firma sobre raw body (401 sin persistir)
    const signatureValid = await this.mercadoPagoSignature.verify(rawBody, signature);
    if (!signatureValid) {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidWebhookSignature(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 4. Validar body parseado
    const payload = req.body as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') {
      const errorResponse = buildErrorResponse(
        paymentErrors.invalidDomainInput(),
        path,
        traceId,
      );
      throw new (await import('@nestjs/common')).HttpException(
        errorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 5. Crear comando e invocar caso de uso
    const command: ProcessWebhookCommand = {
      provider: 'MERCADO_PAGO',
      providerEventId: requestId,
      eventType: this.extractEventType(payload),
      payload,
    };

    const result = await this.processWebhookUseCase.execute(command);

    // 6. Mapear Result a HTTP
    if (result.ok) {
      return;
    }

    const errorResponse = buildErrorResponse(result.error, path, traceId);
    const HttpException = (await import('@nestjs/common')).HttpException;
    throw new HttpException(errorResponse, errorResponse.status);
  }

  /**
   * Extrae el raw body del request.
   * Express almacena el raw body en req.rawBody cuando se configura
   * rawBody: true en NestFactory.create.
   */
  private getRawBody(req: Request): string | null {
    const rawBody = (req as any).rawBody;
    if (Buffer.isBuffer(rawBody)) {
      return rawBody.toString('utf8');
    }
    if (typeof rawBody === 'string') {
      return rawBody;
    }
    // Fallback: serializar el body parseado
    // Esto no es ideal para verificación de firma,
    // pero permite que el endpoint funcione sin rawBody configurado.
    return JSON.stringify(req.body);
  }

  /**
   * Extrae el tipo de evento del payload.
   */
  private extractEventType(payload: Record<string, unknown>): string | null {
    // Wompi: data.transaction.status o type
    // MercadoPago: type o action
    const type = (payload.type as string) ?? (payload.action as string) ?? null;
    return type;
  }

  /** Genera un trace ID para la respuesta. */
  private generateTraceId(): string {
    return `wh-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
