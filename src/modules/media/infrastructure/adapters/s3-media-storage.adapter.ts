import { Injectable, Logger } from '@nestjs/common';
import { MediaStoragePort, UploadUrl } from '../../domain/ports/media-storage.port';

/**
 * Adapter de salida de almacenamiento S3 real (infrastructure).
 *
 * Genera URLs prefirmadas usando AWS SDK v3 cuando está disponible.
 * Requiere las variables de entorno:
 * - `AWS_REGION`: región de S3
 * - `S3_BUCKET_NAME`: nombre del bucket privado de media
 * - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (o IAM role)
 *
 * Si el SDK no está instalado o las variables faltan, lanza un error
 * técnico en el límite del adapter (no propagate excepciones crudas).
 *
 * No expone credenciales en logs, métricas ni responses.
 * No almacena PAN/CVV ni datos sensibles del cliente.
 */
@Injectable()
export class S3MediaStorageAdapter implements MediaStoragePort {
  private readonly logger = new Logger(S3MediaStorageAdapter.name);
  private readonly ttlSeconds: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlSeconds = ttlSeconds;
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadUrl> {
    const region = process.env.AWS_REGION;
    const bucket = process.env.S3_BUCKET_NAME;

    if (!region || !bucket) {
      this.logger.error(
        'S3MediaStorageAdapter: AWS_REGION or S3_BUCKET_NAME not configured',
      );
      throw new Error('S3 configuration missing');
    }

    // Intentar cargar AWS SDK v3 dinámicamente
    // Nota: @aws-sdk debe estar en dependencies para usar este adapter.
    // Si no está instalado, se lanza un error claro.
    let S3Client: new (config: Record<string, unknown>) => Record<string, unknown>;
    let PutObjectCommand: new (input: Record<string, unknown>) => Record<string, unknown>;
    let getSignedUrl: (
      client: Record<string, unknown>,
      command: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => Promise<string>;

    try {
      // @ts-ignore — @aws-sdk es opcional; se importa dinámicamente
      const s3Module = await import('@aws-sdk/client-s3');
      // @ts-ignore — @aws-sdk es opcional; se importa dinámicamente
      const presignerModule = await import('@aws-sdk/s3-request-presigner');
      S3Client = s3Module.S3Client;
      PutObjectCommand = s3Module.PutObjectCommand;
      getSignedUrl = presignerModule.getSignedUrl;
    } catch {
      this.logger.error(
        'S3MediaStorageAdapter: @aws-sdk packages not installed. Install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.',
      );
      throw new Error('AWS SDK not available');
    }

    try {
      const client = new S3Client({ region });
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
        // Bucket privado: sin acceso público
        ACL: 'private',
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: this.ttlSeconds,
      });

      const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
      return { url, expiresAt };
    } catch (error: unknown) {
      // Traducir errores técnicos en el límite del adapter (ROP)
      const message =
        error instanceof Error ? error.message : 'Unknown S3 error';
      this.logger.error(`S3MediaStorageAdapter: technical failure: ${message}`);
      throw new Error(`S3 presigned URL generation failed: ${message}`);
    }
  }
}
