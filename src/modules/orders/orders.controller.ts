import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import { projectResult } from '../../shared/http/result-projector';
import { ORDERS_TOKENS } from './orders.tokens';
import { ListOrdersUseCase, ListOrdersQuery } from './application/use-cases/list-orders.use-case';
import { OrderResponse, PagedOrderResponse } from '../../contract/schemas';

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

/**
 * Adapter de entrada HTTP del módulo `orders`.
 *
 * Valida transporte, invoca un único puerto de entrada y proyecta el Result
 * a HTTP. Nunca contiene reglas de negocio ni Prisma.
 */
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(ORDERS_TOKENS.LIST_ORDERS_USE_CASE)
    private readonly listOrdersUseCase: ListOrdersUseCase,
  ) {}

  /**
   * GET /orders — Lista órdenes propias paginadas (AC-08).
   *
   * Security: bearerAuth
   * Solo lectura; cliente ve sus órdenes.
   */
  @Get()
  async listOrders(
    @Query('page') page: string | undefined,
    @Query('size') size: string | undefined,
    @Req() req: Request,
  ): Promise<PagedOrderResponse> {
    const actor = getActor(req);
    if (!actor) {
      throw new BadRequestException({
        timestamp: new Date().toISOString(),
        status: 401,
        error: 'Unauthorized',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Se requiere autenticación.',
        path: '/orders',
        trace_id: '',
      });
    }

    const traceId = this.generateTraceId();
    const path = '/orders';

    const pageNum = page ? parseInt(page, 10) : 1;
    const sizeNum = size ? parseInt(size, 10) : 20;

    if (isNaN(pageNum) || pageNum < 1 || isNaN(sizeNum) || sizeNum < 1 || sizeNum > 100) {
      throw new BadRequestException({
        timestamp: new Date().toISOString(),
        status: 400,
        error: 'Bad Request',
        code: 'INVALID_DOMAIN_INPUT',
        message: 'Parámetros de paginación inválidos.',
        path,
        trace_id: traceId,
      });
    }

    const query: ListOrdersQuery = {
      ownerId: actor.id,
      page: pageNum,
      size: sizeNum,
    };

    const result = await this.listOrdersUseCase.execute(query);
    const value = projectResult(result, path, traceId);
    return this.mapToPagedOrderResponse(value);
  }

  /**
   * GET /orders/:orderId — Detalle de orden propia (AC-08).
   *
   * Security: bearerAuth
   * Solo lectura; cliente ve sus órdenes.
   */
  @Get(':orderId')
  async getOrder(
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ): Promise<OrderResponse> {
    const actor = getActor(req);
    if (!actor) {
      throw new BadRequestException({
        timestamp: new Date().toISOString(),
        status: 401,
        error: 'Unauthorized',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Se requiere autenticación.',
        path: `/orders/${orderId}`,
        trace_id: '',
      });
    }

    const traceId = this.generateTraceId();
    const path = `/orders/${orderId}`;

    // TODO: Implementar getOrderById en MSF-PAY-001
    // Por ahora retornar 404
    throw new BadRequestException({
      timestamp: new Date().toISOString(),
      status: 404,
      error: 'Not Found',
      code: 'RESOURCE_NOT_FOUND',
      message: 'Orden no encontrada.',
      path,
      trace_id: traceId,
    });
  }

  /** Genera un trace ID para la respuesta. */
  private generateTraceId(): string {
    return `orders-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /** Mapea el resultado del caso de uso a PagedOrderResponse contractual. */
  private mapToPagedOrderResponse(value: any): PagedOrderResponse {
    return {
      items: value.items.map((item: any) => ({
        id: item.id,
        order_number: item.order_number,
        status: item.status,
        items_subtotal_cop: item.items_subtotal_cop,
        delivery_fee_cop: 5000,
        iva_cop: item.iva_cop,
        tax_rate_basis_points: 1900,
        total_cop: item.total_cop,
        items: item.items,
        delivery_recipient_name: item.delivery_recipient_name,
        delivery_line1: item.delivery_line1,
        delivery_city: item.delivery_city,
        delivery_phone: item.delivery_phone,
        created_at: item.created_at,
      })),
      page: {
        page: value.page,
        size: value.size,
        total: value.total,
      },
    };
  }
}
