import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import { TransportValidationPipe } from '../../shared/http/transport-validation.pipe';
import { projectResult } from '../../shared/http/result-projector';
import { validateCreateCheckoutRequest } from '../../contract/validation/request-validators';
import { validateIdempotencyKey } from '../../contract/validation/header-validators';
import { CHECKOUT_TOKENS } from './checkout.tokens';
import { CreateCheckoutUseCase, CreateCheckoutCommand } from './application/use-cases/create-checkout.use-case';
import { CheckoutResponse, OrderResponse } from '../../contract/schemas';

/** Tipo del body validado para POST /checkouts. */
interface ValidatedCheckoutBody {
  readonly delivery_address: {
    readonly recipient_name: string;
    readonly line1: string;
    readonly city: string;
    readonly phone: string;
  };
  readonly payment_provider: 'WOMPI' | 'MERCADO_PAGO';
}

/** Tipo del usuario autenticado extraído por el guard. */
interface AuthenticatedActor {
  readonly id: string;
  readonly sessionId: string;
}

/** Devuelve el actor del request o lanza 401. */
function getActor(req: Request): AuthenticatedActor | null {
  const u = (req as Request & { user?: { id?: string; sessionId?: string } }).user;
  if (!u || !u.id || !u.sessionId) return null;
  return { id: u.id, sessionId: u.sessionId };
}

/** Lanza 400 si el Idempotency-Key no es UUID. */
function requireIdempotencyKey(
  value: string | undefined,
  path: string,
  traceId: string,
): asserts value is string {
  if (!value) {
    throw new BadRequestException({
      timestamp: new Date().toISOString(),
      status: 400,
      error: 'Bad Request',
      code: 'INVALID_DOMAIN_INPUT',
      message: 'Se requiere Idempotency-Key.',
      path,
      trace_id: traceId,
    });
  }
  const validation = validateIdempotencyKey(value);
  if (!validation.valid) {
    throw new BadRequestException({
      timestamp: new Date().toISOString(),
      status: 400,
      error: 'Bad Request',
      code: 'INVALID_DOMAIN_INPUT',
      message: 'Idempotency-Key debe ser UUID válido.',
      path,
      trace_id: traceId,
    });
  }
}

/**
 * Adapter de entrada HTTP del módulo `checkout`.
 *
 * Valida transporte, invoca un único puerto de entrada y proyecta el Result
 * a HTTP. Nunca contiene reglas de negocio ni Prisma.
 */
@Controller('checkouts')
export class CheckoutController {
  constructor(
    @Inject(CHECKOUT_TOKENS.CREATE_CHECKOUT_USE_CASE)
    private readonly createCheckoutUseCase: CreateCheckoutUseCase,
  ) {}

  /**
   * POST /checkouts — Crear checkout (AC-08 / ADR-009).
   *
   * Security: bearerAuth
   * Cliente únicamente; admin recibe 403.
   * Convierte reservas ACTIVE a CHECKOUT_PENDING y crea orden + pago pending.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCheckout(
    @Body(new TransportValidationPipe(validateCreateCheckoutRequest))
    body: ValidatedCheckoutBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ): Promise<CheckoutResponse> {
    const actor = getActor(req);
    if (!actor) {
      throw new BadRequestException({
        timestamp: new Date().toISOString(),
        status: 401,
        error: 'Unauthorized',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Se requiere autenticación.',
        path: '/checkouts',
        trace_id: '',
      });
    }

    const traceId = this.generateTraceId();
    const path = '/checkouts';

    requireIdempotencyKey(idempotencyKey, path, traceId);

    const command: CreateCheckoutCommand = {
      sessionId: actor.sessionId,
      userId: actor.id,
      deliveryAddress: {
        recipientName: body.delivery_address.recipient_name,
        line1: body.delivery_address.line1,
        city: body.delivery_address.city,
        phone: body.delivery_address.phone,
      },
      idempotencyKey,
      canonicalBody: JSON.stringify(body),
    };

    const result = await this.createCheckoutUseCase.execute(command);
    const value = projectResult(result, path, traceId);
    return this.mapToCheckoutResponse(value);
  }

  /** Genera un trace ID para la respuesta. */
  private generateTraceId(): string {
    return `checkout-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /** Mapea el resultado del caso de uso a CheckoutResponse contractual. */
  private mapToCheckoutResponse(value: any): CheckoutResponse {
    const order: OrderResponse = {
      id: value.orderId,
      order_number: value.orderNumber,
      status: 'PENDING_PAYMENT',
      items_subtotal_cop: Number(value.itemsSubtotalCop),
      delivery_fee_cop: 5000,
      iva_cop: Number(value.ivaCop),
      tax_rate_basis_points: 1900,
      total_cop: Number(value.totalCop),
      items: [],
      delivery_recipient_name: '',
      delivery_line1: '',
      delivery_city: '',
      delivery_phone: '',
      created_at: new Date().toISOString(),
    };

    return {
      order,
      payment: {
        id: value.paymentId,
        provider: 'WOMPI',
        status: 'PENDING',
        amount_cop: Number(value.totalCop),
      },
      provider_checkout_url: '',
    };
  }
}
