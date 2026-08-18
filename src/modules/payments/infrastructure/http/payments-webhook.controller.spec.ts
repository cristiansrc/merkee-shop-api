import { PaymentsWebhookController } from './payments-webhook.controller';
import { PAYMENTS_TOKENS } from '../../payments.tokens';
import { ok, fail } from '../../../../shared/domain/result';
import { HttpException } from '@nestjs/common';
import { paymentErrors } from '../../domain/payment-errors';

function errorResponseFrom(e: unknown): any {
  const err = e as HttpException;
  return err.getResponse();
}

function buildReq(body: any = {}, rawBody?: string): any {
  return {
    body,
    rawBody: rawBody ? Buffer.from(rawBody) : undefined,
    headers: {},
    path: '/webhooks/wompi',
  };
}

describe('PaymentsWebhookController', () => {
  let mockProcessWebhook: jest.Mock;
  let mockWompiSignature: any;
  let mockMpSignature: any;
  let controller: PaymentsWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessWebhook = jest.fn();
    mockWompiSignature = { verify: jest.fn().mockResolvedValue(true) };
    mockMpSignature = { verify: jest.fn().mockResolvedValue(true) };
    controller = new PaymentsWebhookController(
      { execute: mockProcessWebhook } as any,
      mockWompiSignature,
      mockMpSignature,
    );
  });

  describe('POST /webhooks/wompi', () => {
    it('acepta webhook válido con firma correcta', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      await expect(
        controller.receiveWompiWebhook(
          buildReq({ type: 'transaction.updated', data: { transaction: { status: 'approved' } } }),
          'evt-1',
          'sig-123',
        ),
      ).resolves.toBeUndefined();
    });

    it('lanza 400 cuando falta X-Event-Id', async () => {
      await expect(
        controller.receiveWompiWebhook(buildReq({}), undefined, 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando X-Event-Id está vacío', async () => {
      await expect(
        controller.receiveWompiWebhook(buildReq({}), '  ', 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando falta X-Event-Signature', async () => {
      await expect(
        controller.receiveWompiWebhook(buildReq({}), 'evt-1', undefined),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando X-Event-Signature está vacío', async () => {
      await expect(
        controller.receiveWompiWebhook(buildReq({}), 'evt-1', '  '),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 401 cuando la firma es inválida', async () => {
      mockWompiSignature.verify.mockResolvedValue(false);
      await expect(
        controller.receiveWompiWebhook(
          buildReq({ type: 'transaction.updated' }),
          'evt-1',
          'bad-sig',
        ),
      ).rejects.toThrow(HttpException);
      try {
        await controller.receiveWompiWebhook(
          buildReq({ type: 'transaction.updated' }),
          'evt-1',
          'bad-sig',
        );
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_WEBHOOK_SIGNATURE');
        expect(errorResponseFrom(e).status).toBe(401);
      }
    });

    it('lanza 400 cuando body es un string (no objeto)', async () => {
      const req = buildReq('not-an-object');
      req.rawBody = Buffer.from('not-an-object');
      await expect(
        controller.receiveWompiWebhook(req, 'evt-1', 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('usa fallback JSON.stringify cuando rawBody no está disponible', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      const req = buildReq({ type: 'transaction.updated' });
      req.rawBody = undefined;
      await expect(
        controller.receiveWompiWebhook(req, 'evt-1', 'sig-123'),
      ).resolves.toBeUndefined();
    });

    it('maneja rawBody como string', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      const req = buildReq({ type: 'transaction.updated' });
      req.rawBody = 'raw string body';
      await expect(
        controller.receiveWompiWebhook(req, 'evt-1', 'sig-123'),
      ).resolves.toBeUndefined();
    });

    it('lanza error cuando el use case falla', async () => {
      mockProcessWebhook.mockResolvedValue(
        fail(paymentErrors.invalidDomainInput()),
      );
      await expect(
        controller.receiveWompiWebhook(
          buildReq({ type: 'transaction.updated' }),
          'evt-1',
          'sig-123',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('extrae type del payload correctamente', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      await controller.receiveWompiWebhook(
        buildReq({ action: 'payment.created', data: {} }),
        'evt-1',
        'sig-123',
      );
      expect(mockProcessWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'payment.created' }),
      );
    });

    it('retorna null para eventType cuando no hay type ni action', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      await controller.receiveWompiWebhook(
        buildReq({ data: {} }),
        'evt-1',
        'sig-123',
      );
      expect(mockProcessWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: null }),
      );
    });
  });

  describe('POST /webhooks/mercado-pago', () => {
    it('acepta webhook válido con firma correcta', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      await expect(
        controller.receiveMercadoPagoWebhook(
          buildReq({ type: 'payment', action: 'payment.created' }),
          'req-1',
          'mp-sig-123',
        ),
      ).resolves.toBeUndefined();
    });

    it('lanza 400 cuando falta X-Request-Id', async () => {
      await expect(
        controller.receiveMercadoPagoWebhook(buildReq({}), undefined, 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando X-Request-Id está vacío', async () => {
      await expect(
        controller.receiveMercadoPagoWebhook(buildReq({}), '  ', 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando falta X-Signature', async () => {
      await expect(
        controller.receiveMercadoPagoWebhook(buildReq({}), 'req-1', undefined),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 400 cuando X-Signature está vacío', async () => {
      await expect(
        controller.receiveMercadoPagoWebhook(buildReq({}), 'req-1', '  '),
      ).rejects.toThrow(HttpException);
    });

    it('lanza 401 cuando la firma de MP es inválida', async () => {
      mockMpSignature.verify.mockResolvedValue(false);
      await expect(
        controller.receiveMercadoPagoWebhook(
          buildReq({ type: 'payment' }),
          'req-1',
          'bad-sig',
        ),
      ).rejects.toThrow(HttpException);
      try {
        await controller.receiveMercadoPagoWebhook(
          buildReq({ type: 'payment' }),
          'req-1',
          'bad-sig',
        );
      } catch (e) {
        expect(errorResponseFrom(e).code).toBe('INVALID_WEBHOOK_SIGNATURE');
        expect(errorResponseFrom(e).status).toBe(401);
      }
    });

    it('lanza 400 cuando body es un string (no objeto) para MP', async () => {
      const req = buildReq('not-an-object');
      req.rawBody = Buffer.from('not-an-object');
      await expect(
        controller.receiveMercadoPagoWebhook(req, 'req-1', 'sig-123'),
      ).rejects.toThrow(HttpException);
    });

    it('usa fallback JSON.stringify cuando rawBody no está disponible para MP', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      const req = buildReq({ type: 'payment' });
      req.rawBody = undefined;
      await expect(
        controller.receiveMercadoPagoWebhook(req, 'req-1', 'sig-123'),
      ).resolves.toBeUndefined();
    });

    it('maneja rawBody como string para MP', async () => {
      mockProcessWebhook.mockResolvedValue(ok({ outcome: 'accepted' }));
      const req = buildReq({ type: 'payment' });
      req.rawBody = 'raw string body';
      await expect(
        controller.receiveMercadoPagoWebhook(req, 'req-1', 'sig-123'),
      ).resolves.toBeUndefined();
    });

    it('lanza error cuando el use case falla para MP', async () => {
      mockProcessWebhook.mockResolvedValue(
        fail(paymentErrors.invalidDomainInput()),
      );
      await expect(
        controller.receiveMercadoPagoWebhook(
          buildReq({ type: 'payment' }),
          'req-1',
          'sig-123',
        ),
      ).rejects.toThrow(HttpException);
    });
  });
});
