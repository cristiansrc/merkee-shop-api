import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { MediaStoragePort } from '../../domain/ports/media-storage.port';
import { MediaIdempotencyPort } from '../../domain/ports/idempotency.port';
import { MediaUserLookupPort } from '../../domain/ports/user-lookup.port';
import {
  authenticationRequired,
  actorNotAuthorized,
  initialPasswordChangeRequired,
  invalidContentType,
  invalidContentLength,
  idempotencyKeyReused,
  technicalFailure,
} from '../../domain/media.errors';

/** Content-types permitidos para subida de media (OpenAPI). */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Tamaño máximo de archivo: 5 MB (5242880 bytes). */
const MAX_CONTENT_LENGTH = 5_242_880;

/** Tamaño mínimo de archivo: 1 byte. */
const MIN_CONTENT_LENGTH = 1;

/** TTL de la URL prefirmada: 5 minutos. */
const PRESIGNED_URL_TTL_SECONDS = 300;

/** Prefijo del bucket de media (configurable vía env). */
const MEDIA_BUCKET_PREFIX = 'merkee-media';

/** Puerto de entrada (caso de uso) de creación de URL de subida de media. */
export interface CreateUploadUrlUseCase {
  execute(command: CreateUploadUrlCommand): Promise<Result<CreateUploadUrlResult, DomainError>>;
}

/** Comando de entrada del caso de uso. */
export interface CreateUploadUrlCommand {
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly contentType: string;
  readonly contentLength: number;
}

/** Resultado de éxito: URL prefirmada de corta duración. */
export interface CreateUploadUrlResult {
  readonly key: string;
  readonly uploadUrl: string;
  readonly expiresAt: Date;
}

/** Snapshot mínimo para idempotencia (sin PII ni secretos). */
interface UploadUrlSnapshot {
  readonly key: string;
  readonly status: number;
  readonly expires_at: string;
  readonly body_hash: string;
}

/** Fábrica de registro de idempotencia media upload (MSF-CAT-001). */
export class CreateUploadUrlUseCaseImpl implements CreateUploadUrlUseCase {
  constructor(
    private readonly storagePort: MediaStoragePort,
    private readonly idempotencyPort: MediaIdempotencyPort,
    private readonly userLookupPort: MediaUserLookupPort,
    private readonly presignedUrlTtlSeconds: number = PRESIGNED_URL_TTL_SECONDS,
  ) {}

  async execute(
    command: CreateUploadUrlCommand,
  ): Promise<Result<CreateUploadUrlResult, DomainError>> {
    // 1. Verificar actor autenticado
    if (!command.actorId) {
      return fail(authenticationRequired());
    }

    // 2. Verificar que el actor es admin y no debe cambiar contraseña
    const actor = await this.userLookupPort.findById(command.actorId);
    if (!actor) {
      return fail(authenticationRequired());
    }
    if (actor.role !== 'admin') {
      return fail(actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(initialPasswordChangeRequired());
    }

    // 3. Validar content_type
    if (!ALLOWED_CONTENT_TYPES.has(command.contentType)) {
      return fail(invalidContentType());
    }

    // 4. Validar content_length
    if (
      !Number.isInteger(command.contentLength) ||
      command.contentLength < MIN_CONTENT_LENGTH ||
      command.contentLength > MAX_CONTENT_LENGTH
    ) {
      return fail(invalidContentLength());
    }

    // 5. Generar clave server-side (bucket privado, path seguro)
    const key = generateServerSideKey(command.contentType);

    // 6. Computar hash del cuerpo canónico para idempotencia
    const bodyHash = computeBodyHash(command);

    // 7. Alcance de idempotencia: media-upload:{actorId}
    const scope = `media-upload:${command.actorId}`;

    // 8. Verificar idempotencia
    const existing = await this.idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      // Replay divergente: body_hash no coincide
      if (existing.bodyHash !== bodyHash) {
        return fail(idempotencyKeyReused());
      }
      // Replay equivalente: reconstruir desde snapshot
      const snap = existing.responseJson as UploadUrlSnapshot | undefined;
      if (snap && typeof snap.key === 'string' && typeof snap.expires_at === 'string') {
        return ok({
          key: snap.key,
          uploadUrl: '', // URL expirada; el cliente debe re-solicitar
          expiresAt: new Date(snap.expires_at),
        });
      }
      // Snapshot corrupto o incompleto: tratar como divergente
      return fail(idempotencyKeyReused());
    }

    // 9. Generar URL prefirmada de corta duración
    let uploadResult: { url: string; expiresAt: Date };
    try {
      uploadResult = await this.storagePort.createUploadUrl(
        key,
        command.contentType,
        command.contentLength,
      );
    } catch {
      // Adapter traduce errores técnicos a DomainError en su límite;
      // si llega una excepción aquí, es un error no manejado.
      return fail(technicalFailure());
    }

    // 10. Persistir registro de idempotencia
    const snapshot: UploadUrlSnapshot = {
      key,
      status: 201,
      expires_at: uploadResult.expiresAt.toISOString(),
      body_hash: bodyHash,
    };

    try {
      await this.idempotencyPort.save(scope, command.idempotencyKey, bodyHash, snapshot);
    } catch {
      // Si la clave ya existe (carrera concurrente), devolver replay
      const concurrent = await this.idempotencyPort.find(scope, command.idempotencyKey);
      if (concurrent && concurrent.bodyHash === bodyHash) {
        const snap = concurrent.responseJson as UploadUrlSnapshot | undefined;
        if (snap && typeof snap.key === 'string' && typeof snap.expires_at === 'string') {
          return ok({
            key: snap.key,
            uploadUrl: '',
            expiresAt: new Date(snap.expires_at),
          });
        }
      }
      return fail(technicalFailure());
    }

    // 11. Devolver respuesta contractual
    return ok({
      key,
      uploadUrl: uploadResult.url,
      expiresAt: uploadResult.expiresAt,
    });
  }
}

/**
 * Genera una clave server-side para el objeto en el bucket privado.
 * Formato: `media/{yyyy}/{MM}/{dd}/{uuid}.{ext}`
 * Nunca expone credenciales ni permite path traversal.
 */
function generateServerSideKey(contentType: string): string {
  const ext = extensionForContentType(contentType);
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const uuid = randomUUID();
  return `media/${year}/${month}/${day}/${uuid}.${ext}`;
}

/** Resuelve la extensión de archivo desde el content-type. */
function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

/**
 * Computa SHA-256 del cuerpo canónico del comando para idempotencia.
 * Canonical: { content_type, content_length }.
 */
function computeBodyHash(command: CreateUploadUrlCommand): string {
  const canonical = JSON.stringify({
    content_type: command.contentType,
    content_length: command.contentLength,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
