import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { Result, isSuccess } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import { TransportValidationPipe } from '../../shared/http/transport-validation.pipe';
import { TransportAuthGuard } from '../../shared/http/transport-auth.guard';
import { projectResult } from '../../shared/http/result-projector';
import {
  validateCreateUploadUrlRequest,
} from '../../contract/validation/request-validators';
import { validateIdempotencyKey } from '../../contract/validation/header-validators';
import { MEDIA_TOKENS } from './media.tokens';
import {
  CreateUploadUrlUseCase,
  CreateUploadUrlResult,
} from './application/use-cases/create-upload-url.use-case';

/** Tipo del body validado para `POST /media/upload-urls`. */
interface ValidatedUploadUrlBody {
  readonly content_type: string;
  readonly content_length: number;
}

/** Tipo del usuario autenticado extraído por el guard. */
interface AuthenticatedActor {
  readonly id: string;
  readonly sessionId: string;
}

/** Devuelve el actor del request o lanza 401. */
function getActor(req: Request): AuthenticatedActor | null {
  const u = (req as Request & { user?: { id?: string; sessionId?: string } }).user;
  if (!u || !u.id || !u.sessionId) return null;
  return { id: u.id, sessionId: u.sessionId };
}

/** Lanza 400 si el Idempotency-Key no es UUID. */
function requireIdempotencyKey(
  value: string | undefined,
  path: string,
  traceId: string,
): asserts value is string {
  const check = validateIdempotencyKey(value);
  if (!check.valid) {
    throw projectResult(
      {
        ok: false,
        error: {
          code: 'INVALID_DOMAIN_INPUT',
          kind: 'validation',
          messageKey: 'invalid.input',
        },
      } as Result<never, DomainError>,
      path,
      traceId,
    );
  }
  if (typeof value !== 'string') {
    throw new Error('Idempotency-Key required');
  }
}

/**
 * Adapter de entrada HTTP del módulo `media` (MSF-CAT-001).
 *
 * Endpoint:
 *  - `POST /media/upload-urls` → `createMediaUploadUrl`
 *
 * El controller invoca un puerto de entrada y proyecta `Result` a HTTP
 * con `projectResult` (MSF-API-002). No contiene reglas de negocio,
 * validación semántica ni Prisma.
 *
 * Seguridad:
 * - Requiere rol `admin` (TransportAuthGuard + JWT verification)
 * - Requiere `Idempotency-Key` UUID
 * - Rechaza admin con `must_change_password=true` (403)
 * - No expone credenciales S3 en responses, logs ni metrics
 */
@Controller()
export class MediaController {
  constructor(
    @Inject(MEDIA_TOKENS.CREATE_UPLOAD_URL_USE_CASE)
    private readonly createUploadUrlUseCase: CreateUploadUrlUseCase,
  ) {}

  /** `POST /media/upload-urls` — 201 URL prefirmada de corta duración. */
  @Post('media/upload-urls')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TransportAuthGuard)
  async createMediaUploadUrl(
    @Body(new TransportValidationPipe(validateCreateUploadUrlRequest))
    body: ValidatedUploadUrlBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ): Promise<unknown> {
    const path = req.originalUrl ?? req.url ?? '/media/upload-urls';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'media-upload';
    const actor = getActor(req);

    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await this.createUploadUrlUseCase.execute({
      actorId: actor ? actor.id : '',
      idempotencyKey,
      contentType: body.content_type,
      contentLength: body.content_length,
    });

    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }

    // Mapear resultado de aplicación a schema contractual OpenAPI
    const value = (result as { ok: true; value: CreateUploadUrlResult }).value;
    return {
      key: value.key,
      upload_url: value.uploadUrl,
      expires_at: value.expiresAt.toISOString(),
    };
  }
}
