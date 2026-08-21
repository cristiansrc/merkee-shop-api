import { Injectable, Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaStoragePort, UploadUrl } from '../../domain/ports/media-storage.port';

/**
 * Adapter de salida de almacenamiento S3 real (infrastructure).
 *
 * Genera URLs prefirmadas usando AWS SDK v3.
 * Requiere las variables de entorno:
 * - `AWS_REGION`: región de S3
 * - `S3_BUCKET_NAME`: nombre del bucket privado de media
 * - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (o IAM role)
 *
 * Las credenciales NUNCA se pasan por código; el SDK las resuelve
 * automáticamente desde el environment o el EC2 instance role.
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

    try {
      const client = new S3Client({ region });
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
        // Bucket privado con ObjectOwnership=BucketOwnerEnforced:
        // NO se envía ACL, ya que sería rechazado con AccessControlListNotSupported.
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
