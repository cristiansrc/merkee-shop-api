import { OrdersController } from './orders.controller';
import { ORDERS_TOKENS } from './orders.tokens';
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
    path: '/orders',
    originalUrl: '/orders',
    ...overrides,
  };
}

describe('OrdersController', () => {
  let mockUseCase: jest.Mock;
  let controller: OrdersController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCase = jest.fn();
    controller = new OrdersController({ execute: mockUseCase } as any);
  });

  describe('GET /orders', () => {
    it('retorna órdenes paginadas del usuario autenticado', async () => {
      mockUseCase.mockResolvedValue(
        ok({
          items: [
            {
              id: 'ord-1',
              order_number: 'ORD-001',
              status: 'PENDING_PAYMENT',
              items_subtotal_cop: 50000,
              delivery_fee_cop: 5000,
              iva_cop: 9500,
              tax_rate_basis_points: 1900,
              total_cop: 64500,
              items: [],
              delivery_recipient_name: 'Juan',
              delivery_line1: 'Calle 123',
              delivery_city: 'Bogotá',
              delivery_phone: '+57 300 000 0000',
              created_at: '2026-08-17T00:00:00Z',
            },
          ],
          page: 1,
          size: 20,
          total: 1,
        }),
      );
      const result = await controller.listOrders(undefined, undefined, buildReq());
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(result.page.page).toBe(1);
    });

    it('lanza 401 cuando no hay actor autenticado', async () => {
      const req = buildReq({ user: undefined });
      await expect(controller.listOrders(undefined, undefined, req)).rejects.toThrow(HttpException);
      try {
        await controller.listOrders(undefined, undefined, req);
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('AUTHENTICATION_REQUIRED');
        expect(errorResponseFrom(e).status).toBe(401);
      }
    });

    it('lanza 401 cuando el actor no tiene sessionId', async () => {
      const req = buildReq({ user: { id: 'user-1' } });
      await expect(controller.listOrders(undefined, undefined, req)).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando page es inválido', async () => {
      await expect(controller.listOrders('abc', undefined, buildReq())).rejects.toThrow(HttpException);
      try {
        await controller.listOrders('abc', undefined, buildReq());
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('lanza 400 cuando page < 1', async () => {
      await expect(controller.listOrders('0', undefined, buildReq())).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando size es inválido', async () => {
      await expect(controller.listOrders(undefined, 'abc', buildReq())).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando size > 100', async () => {
      await expect(controller.listOrders(undefined, '200', buildReq())).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando size < 1', async () => {
      await expect(controller.listOrders(undefined, '0', buildReq())).rejects.toThrow(HttpException);
    });

    it('maneja page y size como strings numéricos válidos', async () => {
      mockUseCase.mockResolvedValue(ok({ items: [], page: 2, size: 10, total: 0 }));
      const result = await controller.listOrders('2', '10', buildReq());
      expect(result.page.page).toBe(2);
      expect(result.page.size).toBe(10);
    });

    it('proyecta error del use case', async () => {
      mockUseCase.mockResolvedValue(
        fail({ code: 'TECHNICAL_DEPENDENCY_FAILURE', kind: 'technical', messageKey: 'technical' }),
      );
      await expect(controller.listOrders(undefined, undefined, buildReq())).rejects.toThrow(HttpException);
    });
  });

  describe('GET /orders/:orderId', () => {
    it('lanza 401 cuando no hay actor autenticado', async () => {
      const req = buildReq({ user: undefined });
      await expect(controller.getOrder('ord-1', req)).rejects.toThrow(HttpException);
      try {
        await controller.getOrder('ord-1', req);
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('AUTHENTICATION_REQUIRED');
      }
    });

    it('retorna 404 (TODO: getOrderById no implementado)', async () => {
      await expect(controller.getOrder('ord-1', buildReq())).rejects.toThrow(HttpException);
      try {
        await controller.getOrder('ord-1', buildReq());
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('RESOURCE_NOT_FOUND');
        expect(errorResponseFrom(e).status).toBe(404);
      }
    });
  });
});
