import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Req,
  Res,
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
import {
  validateCartItemMutationRequest,
  validateSetCartItemQuantityRequest,
} from '../../contract/validation/request-validators';
import { validateIdempotencyKey } from '../../contract/validation/header-validators';
import { CART_TOKENS } from './cart-reservation.tokens';
import { GetCartUseCase, GetCartResult } from './application/use-cases/get-cart.use-case';
import { AddCartItemUseCase, AddCartItemCommand } from './application/use-cases/add-cart-item.use-case';
import { SetCartItemQuantityUseCase, SetCartItemQuantityCommand } from './application/use-cases/set-cart-item-quantity.use-case';
import { RemoveCartItemUseCase, RemoveCartItemCommand } from './application/use-cases/remove-cart-item.use-case';
import { CartResponse } from '../../contract/schemas';

/** Nombre de la cookie de sesión de carrito de invitado. */
const CART_SESSION_COOKIE = 'merkee_cart_session';

/** Tipo del body validado para POST /cart/items. */
interface ValidatedCartItemBody {
  readonly product_id: string;
  readonly quantity: number;
}

/** Tipo del body validado para PUT /cart/items/{productId}. */
interface ValidatedSetQuantityBody {
  readonly quantity: number;
}

/**
 * Adapter de entrada HTTP del módulo `cart-reservation`.
 *
 * Valida transporte, invoca un único puerto de entrada y proyecta el Result
 * a HTTP. Nunca contiene reglas de negocio ni Prisma.
 */
@Controller('cart')
export class CartReservationController {
  constructor(
    @Inject(CART_TOKENS.GET_CART_USE_CASE)
    private readonly getCartUseCase: GetCartUseCase,
    @Inject(CART_TOKENS.ADD_CART_ITEM_USE_CASE)
    private readonly addCartItemUseCase: AddCartItemUseCase,
    @Inject(CART_TOKENS.SET_CART_ITEM_QUANTITY_USE_CASE)
    private readonly setCartItemQuantityUseCase: SetCartItemQuantityUseCase,
    @Inject(CART_TOKENS.REMOVE_CART_ITEM_USE_CASE)
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
  ) {}

  /**
   * GET /cart — Obtiene el carrito del servidor (AC-02, AC-03).
   *
   * Security: bearerAuth | cartSessionCookie
   * Renueva la sesión y reservas ACTIVE a now()+10m.
   */
  @Get()
  async getCart(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponse> {
    const sessionId = this.extractSessionId(req);
    const traceId = this.generateTraceId();
    const result = await this.getCartUseCase.execute(sessionId);
    const value = projectResult(result, '/cart', traceId);
    return this.mapToCartResponse(value);
  }

  /**
   * POST /cart/items — Agrega cantidad de producto al carrito (AC-02).
   *
   * Security: bearerAuth | cartSessionCookie | {} (guest cookie creación)
   * Crea sesión/cookie de invitado si no existe.
   */
  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async addCartItem(
    @Body(new TransportValidationPipe(validateCartItemMutationRequest))
    body: ValidatedCartItemBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ): Promise<CartResponse> {
    const sessionId = this.extractSessionId(req);
    const traceId = this.generateTraceId();
    const path = '/cart/items';

    if (!idempotencyKey) {
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

    const uuidValidation = validateIdempotencyKey(idempotencyKey);
    if (!uuidValidation.valid) {
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

    const command: AddCartItemCommand = {
      sessionId,
      productId: body.product_id,
      quantity: body.quantity,
      idempotencyKey,
      canonicalBody: JSON.stringify(body),
    };

    const result = await this.addCartItemUseCase.execute(command);
    const value = projectResult(result, path, traceId);
    return this.mapToCartResponse(value);
  }

  /**
   * PUT /cart/items/{productId} — Fijar cantidad reservada (AC-02).
   *
   * Security: bearerAuth | cartSessionCookie
   * Cero no es válido; usar DELETE.
   */
  @Put('items/:productId')
  async setCartItemQuantity(
    @Param('productId') productId: string,
    @Body(new TransportValidationPipe(validateSetCartItemQuantityRequest))
    body: ValidatedSetQuantityBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ): Promise<CartResponse> {
    const sessionId = this.extractSessionId(req);
    const traceId = this.generateTraceId();
    const path = `/cart/items/${productId}`;

    if (!idempotencyKey) {
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

    const uuidValidation = validateIdempotencyKey(idempotencyKey);
    if (!uuidValidation.valid) {
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

    const command: SetCartItemQuantityCommand = {
      sessionId,
      productId,
      quantity: body.quantity,
      idempotencyKey,
      canonicalBody: JSON.stringify(body),
    };

    const result = await this.setCartItemQuantityUseCase.execute(command);
    const value = projectResult(result, path, traceId);
    return this.mapToCartResponse(value);
  }

  /**
   * DELETE /cart/items/{productId} — Eliminar ítem y liberar reserva (AC-02).
   *
   * Security: bearerAuth | cartSessionCookie
   */
  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCartItem(
    @Param('productId') productId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    const sessionId = this.extractSessionId(req);
    const traceId = this.generateTraceId();
    const path = `/cart/items/${productId}`;

    if (!idempotencyKey) {
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

    const uuidValidation = validateIdempotencyKey(idempotencyKey);
    if (!uuidValidation.valid) {
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

    const command: RemoveCartItemCommand = {
      sessionId,
      productId,
      idempotencyKey,
      canonicalBody: JSON.stringify({ product_id: productId }),
    };

    const result = await this.removeCartItemUseCase.execute(command);
    projectResult(result, path, traceId);
  }

  /** Extrae el sessionId de la cookie o el token de autenticación. */
  private extractSessionId(req: Request): string {
    const cookie = req.cookies?.[CART_SESSION_COOKIE];
    if (typeof cookie === 'string' && cookie.length > 0) {
      return cookie;
    }
    // Bearer token: se extrae del JWT payload (simplificado para skeleton)
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      // En producción esto se resuelve con JwtPort.verify
      // Por ahora se extrae del cookie o se falla
      throw new BadRequestException({
        timestamp: new Date().toISOString(),
        status: 401,
        error: 'Unauthorized',
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Se requiere autenticación.',
        path: req.path,
        trace_id: '',
      });
    }
    throw new BadRequestException({
      timestamp: new Date().toISOString(),
      status: 401,
      error: 'Unauthorized',
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Se requiere sesión de carrito.',
      path: req.path,
      trace_id: '',
    });
  }

  /** Genera un trace ID para la respuesta. */
  private generateTraceId(): string {
    return `cart-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /** Mapea el resultado del caso de uso a CartResponse contractual. */
  private mapToCartResponse(value: GetCartResult | any): CartResponse {
    const { cartWithItems, products } = value;
    const cart = cartWithItems.cart;
    const items = cartWithItems.items.map((item: any) => {
      const product = products.get(item.productId);
      return {
        product: product
          ? {
              id: product.id,
              category: {
                id: product.category.id,
                name: product.category.name,
                image: { key: product.category.imageKey, url: '', alt_text: product.category.name, position: 0 },
                version: 1,
              },
              name: product.name,
              description: '',
              regular_price_cop: Number(product.regularPriceCop),
              sale_price_cop: Number(product.salePriceCop),
              unit: product.unit,
              stock_available: product.stockOnHand - product.stockReserved,
              images: product.images.map((img: any) => ({
                key: img.key,
                url: '',
                alt_text: img.altText,
                position: img.position,
              })),
              version: 1,
            }
          : { id: item.productId, category: { id: '', name: '', image: { key: '', url: '', alt_text: '', position: 0 }, version: 1 }, name: '', description: '', regular_price_cop: 0, sale_price_cop: 0, unit: '', stock_available: 0, images: [], version: 1 },
        quantity: item.quantity,
        reservation_status: item.reservation?.status ?? 'ACTIVE',
        reservation_expires_at: item.reservation?.expiresAt?.toISOString() ?? null,
      };
    });

    return {
      id: cart.id,
      status: cart.status,
      items,
      items_subtotal_cop: Number(cart.itemsSubtotalCop),
      delivery_fee_cop: 5000,
      iva_cop: Number(cart.ivaCop),
      tax_rate_basis_points: 1900,
      total_cop: Number(cart.totalCop),
      reservation_expires_at: cart.reservationExpiresAt?.toISOString() ?? null,
    };
  }
}

/** Mock type para Response con passthrough. */
type Response = any;
