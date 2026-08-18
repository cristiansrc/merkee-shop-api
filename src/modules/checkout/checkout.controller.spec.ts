import { CheckoutController } from './checkout.controller';
import { CHECKOUT_TOKENS } from './checkout.tokens';
import { ok, fail } from '../../shared/domain/result';
import { HttpException } from '@nestjs/common';

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
  });
});
