import { CheckoutController } from './checkout.controller';
import { CHECKOUT_TOKENS } from './checkout.tokens';
import { ok, fail } from '../../shared/domain/result';
import { HttpException } from '@nestjs/common';
import { TransportAuthGuard } from '../../shared/http/transport-auth.guard';
import 'reflect-metadata';

function errorResponseFrom(e: unknown): { code: string; status: number } {
  const err = e as HttpException;
  const response = err.getResponse() as any;
  return { code: response?.code ?? '', status: response?.status ?? 0 };
}

function buildReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    user: { id: 'user-1', sessionId: 'session-1' },
    path: '/checkouts',
    originalUrl: '/checkouts',
    ...overrides,
  };
}

describe('CheckoutController', () => {
  let mockUseCase: jest.Mock;
  let controller: CheckoutController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCase = jest.fn();
    controller = new CheckoutController({ execute: mockUseCase } as any);
  });

  describe('POST /checkouts', () => {
    const validBody = {
      delivery_address: {
        recipient_name: 'Juan Pérez',
        line1: 'Calle 123',
        city: 'Bogotá',
        phone: '+57 300 000 0000',
      },
      payment_provider: 'WOMPI' as const,
    };

    it('crea un checkout exitosamente', async () => {
      mockUseCase.mockResolvedValue(
        ok({
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          paymentId: 'pay-1',
          itemsSubtotalCop: 50000n,
          ivaCop: 9500n,
          totalCop: 64500n,
        }),
      );
      const result = await controller.createCheckout(
        validBody,
        '11111111-1111-4111-8111-111111111111',
        buildReq(),
      );
      expect(result).toBeDefined();
      expect(result.order).toBeDefined();
      expect(result.payment).toBeDefined();
    });

    it('lanza 401 cuando no hay actor autenticado', async () => {
      const req = buildReq({ user: undefined });
      await expect(
        controller.createCheckout(validBody, '11111111-1111-4111-8111-111111111111', req),
      ).rejects.toThrow(HttpException);
      try {
        await controller.createCheckout(validBody, '11111111-1111-4111-8111-111111111111', req);
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('AUTHENTICATION_REQUIRED');
        expect(errorResponseFrom(e).status).toBe(401);
      }
    });

    it('lanza 401 cuando el actor no tiene sessionId', async () => {
      const req = buildReq({ user: { id: 'user-1' } });
      await expect(
        controller.createCheckout(validBody, '11111111-1111-4111-8111-111111111111', req),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando falta Idempotency-Key', async () => {
      await expect(
        controller.createCheckout(validBody, undefined, buildReq()),
      ).rejects.toThrow(HttpException);
      try {
        await controller.createCheckout(validBody, undefined, buildReq());
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('lanza 400 cuando Idempotency-Key no es UUID válido', async () => {
      await expect(
        controller.createCheckout(validBody, 'not-a-uuid', buildReq()),
      ).rejects.toThrow(HttpException);
    });

    it('proyecta error del use case', async () => {
      mockUseCase.mockResolvedValue(
        fail({ code: 'CHECKOUT_NO_ACTIVE_RESERVATIONS', kind: 'domain', messageKey: 'checkout.no.reservations' }),
      );
      await expect(
        controller.createCheckout(validBody, '11111111-1111-4111-8111-111111111111', buildReq()),
      ).rejects.toThrow(HttpException);
    });

    it('aplica TransportAuthGuard (JWT real) en el controller', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', CheckoutController) ?? [];
      expect(guards).toContain(TransportAuthGuard);
    });

    it('pasa payment_provider y devuelve CheckoutResponse completo', async () => {
      mockUseCase.mockResolvedValue(
        ok({
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          paymentId: 'pay-1',
          itemsSubtotalCop: 50000,
          deliveryFeeCop: 5000,
          ivaCop: 9500,
          taxRateBasisPoints: 1900,
          totalCop: 64500,
          items: [
            {
              productId: 'prod-1',
              productName: 'Manzana Roja',
              unit: 'kg',
              unitPriceCop: 4900,
              quantity: 2,
              subtotalCop: 9800,
            },
          ],
          delivery: {
            recipientName: 'Juan Pérez',
            line1: 'Calle 123',
            city: 'Bogotá',
            phone: '+57 300 000 0000',
          },
          paymentProvider: 'WOMPI',
          providerReference: 'wompi-tx-1',
          providerCheckoutUrl: 'https://checkout.wompi.co/p/wompi-tx-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );

      const result = await controller.createCheckout(
        validBody,
        '11111111-1111-4111-8111-111111111111',
        buildReq(),
      );

      expect(result.order.id).toBe('ord-1');
      expect(result.order.items).toHaveLength(1);
      expect(result.order.items[0].product_name).toBe('Manzana Roja');
      expect(result.order.delivery_recipient_name).toBe('Juan Pérez');
      expect(result.order.delivery_line1).toBe('Calle 123');
      expect(result.order.delivery_city).toBe('Bogotá');
      expect(result.order.delivery_phone).toBe('+57 300 000 0000');
      expect(result.payment.provider).toBe('WOMPI');
      expect(result.payment.provider_reference).toBe('wompi-tx-1');
      expect(result.provider_checkout_url).toBe('https://checkout.wompi.co/p/wompi-tx-1');
    });

    it('pasa payment_provider del body al caso de uso', async () => {
      mockUseCase.mockResolvedValue(
        ok({
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          paymentId: 'pay-1',
          itemsSubtotalCop: 50000,
          deliveryFeeCop: 5000,
          ivaCop: 9500,
          taxRateBasisPoints: 1900,
          totalCop: 64500,
          items: [],
          delivery: { recipientName: 'Juan', line1: 'Calle 1', city: 'Bogotá', phone: '300' },
          paymentProvider: 'MERCADO_PAGO',
          providerReference: 'mp-1',
          providerCheckoutUrl: 'https://checkout.mp/1',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );

      await controller.createCheckout(
        { ...validBody, payment_provider: 'MERCADO_PAGO' },
        '11111111-1111-4111-8111-111111111111',
        buildReq(),
      );

      expect(mockUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ paymentProvider: 'MERCADO_PAGO' }),
      );
    });

    it('pasa guestSessionId desde la cookie merkee_cart_session', async () => {
      mockUseCase.mockResolvedValue(
        ok({
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          paymentId: 'pay-1',
          itemsSubtotalCop: 50000,
          deliveryFeeCop: 5000,
          ivaCop: 9500,
          taxRateBasisPoints: 1900,
          totalCop: 64500,
          items: [],
          delivery: { recipientName: 'Juan', line1: 'Calle 1', city: 'Bogotá', phone: '300' },
          paymentProvider: 'WOMPI',
          providerReference: 'wompi-tx-1',
          providerCheckoutUrl: 'https://checkout.wompi.co/p/wompi-tx-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );

      const req = buildReq({ cookies: { merkee_cart_session: 'guest-session-1' } });
      await controller.createCheckout(
        validBody,
        '11111111-1111-4111-8111-111111111111',
        req,
      );

      expect(mockUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ guestSessionId: 'guest-session-1' }),
      );
    });
  });
});
