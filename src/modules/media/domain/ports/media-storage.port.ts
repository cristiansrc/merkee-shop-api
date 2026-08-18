/**
 * Puerto de salida de almacenamiento de media (S3 privado) (ADR-006).
 *
 * El dominio/aplicación no conocen el SDK de S3; solo este contrato. El
 * adapter de salida traduce errores técnicos a `DomainError` en su límite.
 */
export interface MediaStoragePort {
  /** Genera una URL prefirmada de corta duración para subir un objeto. */
  createUploadUrl(key: string, contentType: string, sizeBytes: number): Promise<UploadUrl>;
}

/** URL prefirmada de subida de corta duración. */
export interface UploadUrl {
  readonly url: string;
  readonly expiresAt: Date;
}
