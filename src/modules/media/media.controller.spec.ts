import { MediaController } from './media.controller';
import { MEDIA_TOKENS } from './media.tokens';
import { CreateUploadUrlUseCase } from './application/use-cases/create-upload-url.use-case';

/** Stub del caso de uso. */
function stubUseCase(
  overrides: Partial<CreateUploadUrlUseCase> = {},
): CreateUploadUrlUseCase {
  return {
    execute: jest.fn().mockResolvedValue({
      ok: true,
      value: {
        key: 'media/2026/08/17/test.jpg',
        uploadUrl: 'https://bucket.s3.amazonaws.com/test.jpg?X-Amz-Signature=fake',
        expiresAt: new Date(Date.now() + 300_000),
      },
    }),
    ...overrides,
  };
}

/** Construye un request mock de NestJS. */
function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    originalUrl: '/media/upload-urls',
    url: '/media/upload-urls',
    headers: {
      'x-request-id': 'test-trace-id',
      authorization: 'Bearer fake-jwt-token',
      'idempotency-key': '11111111-1111-4111-8111-111111111111',
    },
    user: { id: 'actor-uuid-001', sessionId: 'session-001' },
    ...overrides,
  };
}

describe('MediaController', () => {
  describe('POST /media/upload-urls', () => {
    it('devuelve 201 con schema contractual válido', async () => {
      const useCase = stubUseCase();
      const controller = new MediaController(useCase);
      const req = mockRequest();
      const body = { content_type: 'image/jpeg', content_length: 1024 };

      const result = await controller.createMediaUploadUrl(
        body as never,
        '11111111-1111-4111-8111-111111111111',
        req as never,
      );

      expect(result).toEqual({
        key: 'media/2026/08/17/test.jpg',
        upload_url: 'https://bucket.s3.amazonaws.com/test.jpg?X-Amz-Signature=fake',
        expires_at: expect.any(String),
      });
    });

    it('usa snake_case en la respuesta (OpenAPI)', async () => {
      const useCase = stubUseCase();
      const controller = new MediaController(useCase);
      const req = mockRequest();
      const body = { content_type: 'image/png', content_length: 2048 };

      const result = await controller.createMediaUploadUrl(
        body as never,
        '11111111-1111-4111-8111-111111111111',
        req as never,
      );

      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('upload_url');
      expect(result).toHaveProperty('expires_at');
      // No debe tener camelCase
      expect(result).not.toHaveProperty('uploadUrl');
      expect(result).not.toHaveProperty('expiresAt');
    });

    it('llama al caso de uso con los parámetros correctos', async () => {
      const useCase = stubUseCase();
      const controller = new MediaController(useCase);
      const req = mockRequest();
      const body = { content_type: 'image/webp', content_length: 4096 };

      await controller.createMediaUploadUrl(
        body as never,
        '22222222-2222-4222-8222-222222222222',
        req as never,
      );

      expect(useCase.execute).toHaveBeenCalledWith({
        actorId: 'actor-uuid-001',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        contentType: 'image/webp',
        contentLength: 4096,
      });
    });

    it('proyecta error de dominio a HTTP', async () => {
      const useCase = stubUseCase({
        execute: jest.fn().mockResolvedValue({
          ok: false,
          error: {
            code: 'INITIAL_PASSWORD_CHANGE_REQUIRED',
            kind: 'authorization',
            messageKey: 'admin.initial_password_change_required',
          },
        }),
      });
      const controller = new MediaController(useCase);
      const req = mockRequest();
      const body = { content_type: 'image/jpeg', content_length: 1024 };

      await expect(
        controller.createMediaUploadUrl(
          body as never,
          '11111111-1111-4111-8111-111111111111',
          req as never,
        ),
      ).rejects.toThrow();
    });

    it('extrae actor del request', async () => {
      const useCase = stubUseCase();
      const controller = new MediaController(useCase);
      const req = mockRequest({
        user: { id: 'admin-uuid', sessionId: 'sess-123' },
      });
      const body = { content_type: 'image/jpeg', content_length: 1024 };

      await controller.createMediaUploadUrl(
        body as never,
        '11111111-1111-4111-8111-111111111111',
        req as never,
      );

      expect(useCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'admin-uuid' }),
      );
    });
  });
});
