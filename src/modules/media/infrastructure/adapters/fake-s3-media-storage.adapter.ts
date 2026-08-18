import { Injectable } from '@nestjs/common';
import { MediaStoragePort, UploadUrl } from '../../domain/ports/media-storage.port';

/**
 * Adapter de salida de almacenamiento S3 fake para pruebas (infrastructure).
 *
 * Genera URLs prefirmadas simuladas sin conexión a AWS. Las URLs son
 * válidas sintácticamente pero no apuntan a un bucket real. No expone
 * credenciales, bucket names ni configuration secrets.
 *
 * Se usa cuando `MEDIA_STORAGE_ADAPTER=fake` (default) o cuando AWS
 * no está configurado. La integración real se habilita vía variables
 * de entorno y el puerto `MediaStoragePort`.
 */
@Injectable()
export class FakeS3MediaStorageAdapter implements MediaStoragePort {
  /** TTL por defecto: 5 minutos. */
  private readonly ttlSeconds: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlSeconds = ttlSeconds;
  }

  async createUploadUrl(
    key: string,
    _contentType: string,
    _sizeBytes: number,
  ): Promise<UploadUrl> {
    // Simular URL prefirmada con formato canónico
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const encodedKey = encodeURIComponent(key);
    const url = `https://merkee-media-bucket.s3.amazonaws.com/${encodedKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=fake&X-Amz-Date=${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z&X-Amz-Expires=${this.ttlSeconds}&X-Amz-SignedHeaders=host&X-Amz-Signature=fake-signature-for-testing`;

    return { url, expiresAt };
  }
}
