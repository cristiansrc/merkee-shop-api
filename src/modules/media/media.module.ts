import { Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../cart-reservation/infrastructure/prisma.module';
import { MEDIA_TOKENS } from './media.tokens';
import { MediaController } from './media.controller';
import { CreateUploadUrlUseCaseImpl } from './application/use-cases/create-upload-url.use-case';
import { FakeS3MediaStorageAdapter } from './infrastructure/adapters/fake-s3-media-storage.adapter';
import { S3MediaStorageAdapter } from './infrastructure/adapters/s3-media-storage.adapter';
import { PrismaMediaIdempotencyAdapter } from './infrastructure/adapters/prisma-media-idempotency.adapter';
import { PrismaMediaUserLookupAdapter } from './infrastructure/adapters/prisma-media-user-lookup.adapter';
import { MediaStoragePort } from './domain/ports/media-storage.port';
import { MediaIdempotencyPort } from './domain/ports/idempotency.port';
import { MediaUserLookupPort } from './domain/ports/user-lookup.port';

/** TTL por defecto de URLs prefirmadas: 5 minutos. */
const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 300;

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → implementación concreta)
// ---------------------------------------------------------------------------

/**
 * Selecciona el adapter de almacenamiento S3 según la variable de entorno
 * `MEDIA_STORAGE_ADAPTER`. Si es `real`, usa el adapter de S3 real
 * (requiere AWS SDK y credenciales). En cualquier otro caso usa el fake
 * para pruebas/desarrollo.
 *
 * No expone credenciales en logs ni métricas.
 */
const mediaStorageProvider: Provider = {
  provide: MEDIA_TOKENS.MEDIA_STORAGE,
  useFactory: (): MediaStoragePort => {
    const adapterType = process.env.MEDIA_STORAGE_ADAPTER ?? 'fake';
    const ttl =
      parseInt(process.env.MEDIA_PRESIGNED_URL_TTL_SECONDS ?? '300', 10) ||
      DEFAULT_PRESIGNED_URL_TTL_SECONDS;

    if (adapterType === 'real') {
      return new S3MediaStorageAdapter(ttl);
    }
    return new FakeS3MediaStorageAdapter(ttl);
  },
};

const mediaIdempotencyProvider: Provider = {
  provide: MEDIA_TOKENS.MEDIA_IDEMPOTENCY,
  useClass: PrismaMediaIdempotencyAdapter,
};

const userLookupProvider: Provider = {
  provide: MEDIA_TOKENS.USER_LOOKUP,
  useClass: PrismaMediaUserLookupAdapter,
};

const presignedUrlTtlProvider: Provider = {
  provide: MEDIA_TOKENS.PRESIGNED_URL_TTL_SECONDS,
  useValue: DEFAULT_PRESIGNED_URL_TTL_SECONDS,
};

// ---------------------------------------------------------------------------
// Providers de use cases (MSF-CAT-001): construidos sobre tokens de ports
// ---------------------------------------------------------------------------

const createUploadUrlUseCaseProvider: Provider = {
  provide: MEDIA_TOKENS.CREATE_UPLOAD_URL_USE_CASE,
  useFactory: (
    storagePort: MediaStoragePort,
    idempotencyPort: MediaIdempotencyPort,
    userLookupPort: MediaUserLookupPort,
    ttlSeconds: number,
  ): CreateUploadUrlUseCaseImpl =>
    new CreateUploadUrlUseCaseImpl(
      storagePort,
      idempotencyPort,
      userLookupPort,
      ttlSeconds,
    ),
  inject: [
    MEDIA_TOKENS.MEDIA_STORAGE,
    MEDIA_TOKENS.MEDIA_IDEMPOTENCY,
    MEDIA_TOKENS.USER_LOOKUP,
    MEDIA_TOKENS.PRESIGNED_URL_TTL_SECONDS,
  ],
};

/**
 * Módulo `media` (Master Spec AC-12 / ADR-006 / MSF-CAT-001).
 *
 * Encapsula S3 privado y expone únicamente URLs prefirmadas de corta
 * duración para admin. El controller invoca un único puerto de entrada
 * y proyecta el Result; dominio/application no importan SDK ni HTTP.
 *
 * Configuración:
 * - `MEDIA_STORAGE_ADAPTER`: `fake` (default) | `real`
 * - `AWS_REGION`, `S3_BUCKET_NAME`: requeridos para adapter `real`
 * - `MEDIA_PRESIGNED_URL_TTL_SECONDS`: TTL de URLs (default 300)
 */
@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [
    // Adapters de salida
    mediaStorageProvider,
    mediaIdempotencyProvider,
    userLookupProvider,
    // Use cases
    createUploadUrlUseCaseProvider,
    // Configuración
    presignedUrlTtlProvider,
  ],
})
export class MediaModule {}
