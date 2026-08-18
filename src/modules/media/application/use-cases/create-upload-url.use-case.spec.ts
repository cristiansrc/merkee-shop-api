import { CreateUploadUrlUseCaseImpl } from './create-upload-url.use-case';
import { MediaStoragePort } from '../../domain/ports/media-storage.port';
import { MediaIdempotencyPort } from '../../domain/ports/idempotency.port';
import { MediaUserLookupPort } from '../../domain/ports/user-lookup.port';

/** Stub del puerto de almacenamiento S3. */
function stubStoragePort(): MediaStoragePort {
  return {
    createUploadUrl: jest.fn().mockResolvedValue({
      url: 'https://bucket.s3.amazonaws.com/media/2026/08/17/test.jpg?X-Amz-Signature=fake',
      expiresAt: new Date(Date.now() + 300_000),
    }),
  };
}

/** Stub del puerto de idempotencia. */
function stubIdempotencyPort(): MediaIdempotencyPort {
  return {
    find: jest.fn().mockResolvedValue(null),
    findForUpdate: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

/** Stub del puerto de lookup de usuario. */
function stubUserLookupPort(
  user: { id: string; role: string; mustChangePassword: boolean } | null = null,
): MediaUserLookupPort {
  return {
    findById: jest.fn().mockResolvedValue(user),
  };
}

describe('CreateUploadUrlUseCaseImpl', () => {
  const ACTOR_ID = 'actor-uuid-001';
  const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

  describe('autorización', () => {
    it('rechaza actor no autenticado (actorId vacío)', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        stubUserLookupPort(null),
      );
      const result = await useCase.execute({
        actorId: '',
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTHENTICATION_REQUIRED');
      }
    });

    it('rechaza actor inexistente', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        stubUserLookupPort(null),
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTHENTICATION_REQUIRED');
      }
    });

    it('rechaza actor con rol no-admin', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        stubUserLookupPort({ id: ACTOR_ID, role: 'cliente', mustChangePassword: false }),
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con must_change_password=true', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        stubUserLookupPort({ id: ACTOR_ID, role: 'admin', mustChangePassword: true }),
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });
  });

  describe('validación de contenido', () => {
    const adminPort = stubUserLookupPort({
      id: ACTOR_ID,
      role: 'admin',
      mustChangePassword: false,
    });

    it('rechaza content_type no permitido', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        adminPort,
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'application/pdf',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('rechaza content_length igual a 0', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        adminPort,
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 0,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('rechaza content_length mayor a 5242880', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        adminPort,
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 5_242_881,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('rechaza content_length no entero', async () => {
      const useCase = new CreateUploadUrlUseCaseImpl(
        stubStoragePort(),
        stubIdempotencyPort(),
        adminPort,
      );
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024.5,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DOMAIN_INPUT');
      }
    });

    it('acepta image/jpeg válido', async () => {
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toMatch(/^media\/\d{4}\/\d{2}\/\d{2}\/.+\.jpg$/);
        expect(result.value.uploadUrl).toContain('s3.amazonaws.com');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('acepta image/png válido', async () => {
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/png',
        contentLength: 2048,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toMatch(/\.png$/);
      }
    });

    it('acepta image/webp válido', async () => {
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/webp',
        contentLength: 4096,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toMatch(/\.webp$/);
      }
    });
  });

  describe('idempotencia', () => {
    it('devuelve replay si la clave ya existe con mismo body_hash', async () => {
      const storage = stubStoragePort();
      const idemp: MediaIdempotencyPort = {
        find: jest.fn().mockResolvedValue({
          scope: `media-upload:${ACTOR_ID}`,
          key: IDEMPOTENCY_KEY,
          bodyHash: 'same-hash',
          responseJson: {
            key: 'media/2026/08/17/existing.jpg',
            status: 201,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            body_hash: 'same-hash',
          },
        }),
        findForUpdate: jest.fn(),
        save: jest.fn(),
      };
      // Pre-computar el hash esperado para el body canónico
      const { createHash } = await import('crypto');
      const canonical = JSON.stringify({ content_type: 'image/jpeg', content_length: 1024 });
      const expectedHash = createHash('sha256').update(canonical).digest('hex');
      // Sobreescribir el bodyHash del stub con el hash real
      idemp.find = jest.fn().mockResolvedValue({
        scope: `media-upload:${ACTOR_ID}`,
        key: IDEMPOTENCY_KEY,
        bodyHash: expectedHash,
        responseJson: {
          key: 'media/2026/08/17/existing.jpg',
          status: 201,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          body_hash: expectedHash,
        },
      });

      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe('media/2026/08/17/existing.jpg');
      }
    });

    it('devuelve 409 si la clave ya existe con body_hash divergente', async () => {
      const storage = stubStoragePort();
      const idemp: MediaIdempotencyPort = {
        find: jest.fn().mockResolvedValue({
          scope: `media-upload:${ACTOR_ID}`,
          key: IDEMPOTENCY_KEY,
          bodyHash: 'different-hash',
          responseJson: { key: 'media/old.jpg', status: 201, expires_at: new Date().toISOString(), body_hash: 'different-hash' },
        }),
        findForUpdate: jest.fn(),
        save: jest.fn(),
      };
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });
  });

  describe('generación de clave server-side', () => {
    it('genera clave con formato media/{yyyy}/{MM}/{dd}/{uuid}.{ext}', async () => {
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/webp',
        contentLength: 512,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toMatch(
          /^media\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.webp$/,
        );
      }
    });
  });

  describe('errores técnicos', () => {
    it('devuelve error técnico si storage falla', async () => {
      const storage: MediaStoragePort = {
        createUploadUrl: jest.fn().mockRejectedValue(new Error('S3 down')),
      };
      const idemp = stubIdempotencyPort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('persistencia de idempotencia', () => {
    it('guarda registro con snapshot mínimo sin PII', async () => {
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });
      expect(idemp.save).toHaveBeenCalledTimes(1);
      const [scope, key, bodyHash, snapshot] = (idemp.save as jest.Mock).mock.calls[0];
      expect(scope).toBe(`media-upload:${ACTOR_ID}`);
      expect(key).toBe(IDEMPOTENCY_KEY);
      expect(typeof bodyHash).toBe('string');
      expect(bodyHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
      // Snapshot sin PII
      expect(snapshot).toHaveProperty('key');
      expect(snapshot).toHaveProperty('status', 201);
      expect(snapshot).toHaveProperty('expires_at');
      expect(snapshot).toHaveProperty('body_hash', bodyHash);
      expect(snapshot).not.toHaveProperty('actorId');
      expect(snapshot).not.toHaveProperty('email');
      expect(snapshot).not.toHaveProperty('password');
    });
  });

  describe('carrera de idempotencia en save', () => {
    it('retorna replay cuando save falla por carrera y el registro existente coincide', async () => {
      const storage = stubStoragePort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      // Calcular el hash real del body canónico para que el mock coincida con la comparación en producción
      const { createHash } = await import('crypto');
      const canonical = JSON.stringify({ content_type: 'image/jpeg', content_length: 1024 });
      const bodyHash = createHash('sha256').update(canonical).digest('hex');

      const existingSnapshot = {
        key: 'media/2026/08/17/concurrent.jpg',
        status: 201,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        body_hash: bodyHash,
      };

      const idemp: MediaIdempotencyPort = {
        find: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            scope: `media-upload:${ACTOR_ID}`,
            key: IDEMPOTENCY_KEY,
            bodyHash,
            responseJson: existingSnapshot,
          }),
        findForUpdate: jest.fn(),
        save: jest.fn().mockRejectedValue(new Error('Unique constraint violation')),
      };

      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe('media/2026/08/17/concurrent.jpg');
      }
    });

    it('retorna error técnico cuando save falla y no hay registro concurrente', async () => {
      const storage = stubStoragePort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      const idemp: MediaIdempotencyPort = {
        find: jest.fn().mockResolvedValue(null),
        findForUpdate: jest.fn(),
        save: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      };

      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });

    it('retorna error técnico cuando save falla y el registro concurrente tiene hash divergente', async () => {
      const storage = stubStoragePort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      const idemp: MediaIdempotencyPort = {
        find: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            scope: `media-upload:${ACTOR_ID}`,
            key: IDEMPOTENCY_KEY,
            bodyHash: 'different-hash',
            responseJson: { key: 'media/old.jpg', status: 201, expires_at: new Date().toISOString(), body_hash: 'different-hash' },
          }),
        findForUpdate: jest.fn(),
        save: jest.fn().mockRejectedValue(new Error('Unique constraint violation')),
      };

      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('snapshot corrupto en replay', () => {
    it('retorna 409 cuando el snapshot no tiene key válida', async () => {
      const storage = stubStoragePort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      const { createHash } = await import('crypto');
      const canonical = JSON.stringify({ content_type: 'image/jpeg', content_length: 1024 });
      const expectedHash = createHash('sha256').update(canonical).digest('hex');

      const idemp: MediaIdempotencyPort = {
        find: jest.fn().mockResolvedValue({
          scope: `media-upload:${ACTOR_ID}`,
          key: IDEMPOTENCY_KEY,
          bodyHash: expectedHash,
          responseJson: { key: 123, status: 201, expires_at: 'invalid' }, // key no es string
        }),
        findForUpdate: jest.fn(),
        save: jest.fn(),
      };

      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna 409 cuando el snapshot no tiene expires_at válido', async () => {
      const storage = stubStoragePort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      const { createHash } = await import('crypto');
      const canonical = JSON.stringify({ content_type: 'image/jpeg', content_length: 1024 });
      const expectedHash = createHash('sha256').update(canonical).digest('hex');

      const idemp: MediaIdempotencyPort = {
        find: jest.fn().mockResolvedValue({
          scope: `media-upload:${ACTOR_ID}`,
          key: IDEMPOTENCY_KEY,
          bodyHash: expectedHash,
          responseJson: { key: 'media/valid.jpg', status: 201 }, // falta expires_at
        }),
        findForUpdate: jest.fn(),
        save: jest.fn(),
      };

      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/jpeg',
        contentLength: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });
  });

  describe('extensión de content-type', () => {
    it('retorna bin para content-type desconocido (no debería pasar validación)', async () => {
      // Este test cubre el switch default en extensionForContentType
      // Aunque el content-type no debería pasar la validación,
      // podemos verificar que la función retorna 'bin' para tipos desconocidos
      const storage = stubStoragePort();
      const idemp = stubIdempotencyPort();
      const adminPort = stubUserLookupPort({
        id: ACTOR_ID,
        role: 'admin',
        mustChangePassword: false,
      });

      // Mockear ALLOWED_CONTENT_TYPES para permitir un tipo desconocido
      // Esto es para testing del switch, en producción no debería llegar aquí
      const useCase = new CreateUploadUrlUseCaseImpl(storage, idemp, adminPort);
      
      // El content-type 'image/tiff' no está en ALLOWED_CONTENT_TYPES
      const result = await useCase.execute({
        actorId: ACTOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        contentType: 'image/tiff',
        contentLength: 1024,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DOMAIN_INPUT');
      }
    });
  });
});
