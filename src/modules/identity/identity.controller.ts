import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Result, isSuccess } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import { TransportValidationPipe } from '../../shared/http/transport-validation.pipe';
import { TransportAuthGuard } from '../../shared/http/transport-auth.guard';
import { projectResult } from '../../shared/http/result-projector';
import {
  validateUpdateProfileRequest,
  validatePasswordChangeRequest,
  validatePasswordResetRequest,
  validatePasswordResetConfirmRequest,
} from '../../contract/validation/request-validators';
import { validateIdempotencyKey } from '../../contract/validation/header-validators';
import { IDENTITY_TOKENS } from './identity.tokens';
import { GetMyProfileUseCase, GetMyProfileResult } from './application/use-cases/get-my-profile.use-case';
import { UpdateProfileUseCase, UpdateProfileResult } from './application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';

/** Nombre de la cookie de refresh opaca (HttpOnly). Debe coincidir con OpenAPI. */
const REFRESH_COOKIE_NAME = 'merkee_refresh_session';

/** Tipo del body validado para `PATCH /me`. */
interface ValidatedUpdateProfileBody {
  readonly display_name?: string;
  readonly phone?: string | null;
}

/** Tipo del body validado para `POST /auth/password-change`. */
interface ValidatedPasswordChangeBody {
  readonly current_password: string;
  readonly new_password: string;
}

/** Tipo del body validado para `POST /auth/password-reset-requests`. */
interface ValidatedPasswordResetRequestBody {
  readonly email: string;
}

/** Tipo del body validado para `POST /auth/password-resets`. */
interface ValidatedPasswordResetConfirmBody {
  readonly token: string;
  readonly new_password: string;
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
    throw new BadRequestException();
  }
}

/**
 * Adapter de entrada HTTP del módulo `identity` (MSF-ID-003).
 *
 * Endpoints:
 *  - `GET  /me`                  → `getMyProfile`
 *  - `PATCH /me`                 → `updateMyProfile`
 *  - `POST /auth/password-change`→ `changePassword`
 *  - `POST /auth/password-reset-requests` → `requestPasswordReset`
 *  - `POST /auth/password-resets`         → `resetPassword`
 *
 * El controller invoca puertos de aplicación y proyecta `Result` a HTTP
 * con `projectResult` (MSF-API-002). No contiene reglas de negocio,
 * validación semántica ni Prisma.
 */
@Controller()
export class IdentityController {
  constructor(
    @Inject(IDENTITY_TOKENS.GET_MY_PROFILE_USE_CASE)
    private readonly getMyProfileUseCase: GetMyProfileUseCase,
    @Inject(IDENTITY_TOKENS.UPDATE_PROFILE_USE_CASE)
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    @Inject(IDENTITY_TOKENS.CHANGE_PASSWORD_USE_CASE)
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    @Inject(IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_USE_CASE)
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    @Inject(IDENTITY_TOKENS.RESET_PASSWORD_USE_CASE)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  /** `GET /me` — perfil del usuario autenticado. */
  @Get('me')
  @UseGuards(TransportAuthGuard)
  async getMyProfile(@Req() req: Request): Promise<unknown> {
    const path = req.originalUrl ?? req.url ?? '/me';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'profile';
    const actor = getActor(req);

    const result = await this.getMyProfileUseCase.execute({
      accessToken: null,
      userIdFromGuard: actor ? actor.id : null,
    });
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return (result as { ok: true; value: GetMyProfileResult }).value.user;
  }

  /** `PATCH /me` — actualiza `display_name` y/o `phone`. */
  @Patch('me')
  @UseGuards(TransportAuthGuard)
  async updateProfile(
    @Body(new TransportValidationPipe(validateUpdateProfileRequest))
    body: ValidatedUpdateProfileBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) _res: Response,
  ): Promise<unknown> {
    const path = req.originalUrl ?? req.url ?? '/me';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'patch-profile';
    const actor = getActor(req);

    requireIdempotencyKey(idempotencyKey, path, traceId);

    const safeBody = body ?? {};

    const result = await this.updateProfileUseCase.execute({
      actorId: actor ? actor.id : '',
      idempotencyKey,
      body: safeBody,
    });
    if (!isSuccess(result)) {
      return projectResult(result, path, traceId);
    }
    return (result as { ok: true; value: UpdateProfileResult }).value.user;
  }

  /** `POST /auth/password-change` — 204 + Set-Cookie rotada. */
  @Post('auth/password-change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TransportAuthGuard)
  async changePassword(
    @Body(new TransportValidationPipe(validatePasswordChangeRequest))
    body: ValidatedPasswordChangeBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const path = req.originalUrl ?? req.url ?? '/auth/password-change';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'password-change';
    const actor = getActor(req);

    requireIdempotencyKey(idempotencyKey, path, traceId);

    const result = await this.changePasswordUseCase.execute({
      actorId: actor ? actor.id : '',
      currentSessionId: actor ? actor.sessionId : '',
      currentPassword: body.current_password,
      newPassword: body.new_password,
      idempotencyKey,
    });
    if (!isSuccess(result)) {
      projectResult(result, path, traceId);
    }

    // ADR-020: Set-Cookie SOLO en primera ejecución exitosa (kind === 'changed').
    // En replay idempotente (kind === 'replay'), 204 sin Set-Cookie.
    if (isSuccess(result) && result.value.kind === 'changed') {
      res.cookie(REFRESH_COOKIE_NAME, result.value.newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: result.value.cookieExpiresAt,
      });
    }
    return;
  }

  /** `POST /auth/password-reset-requests` — 202 siempre, respuesta neutra. */
  @Post('auth/password-reset-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(new TransportValidationPipe(validatePasswordResetRequest))
    body: ValidatedPasswordResetRequestBody,
    @Req() req: Request,
  ): Promise<void> {
    const path = req.originalUrl ?? req.url ?? '/auth/password-reset-requests';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'password-reset-request';

    const result = await this.requestPasswordResetUseCase.execute({
      email: body.email,
    });
    if (!isSuccess(result)) {
      projectResult(result, path, traceId);
    }
    // Siempre 202 sin body.
    return;
  }

  /** `POST /auth/password-resets` — 204 si el token es válido. */
  @Post('auth/password-resets')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new TransportValidationPipe(validatePasswordResetConfirmRequest))
    body: ValidatedPasswordResetConfirmBody,
    @Req() req: Request,
  ): Promise<void> {
    const path = req.originalUrl ?? req.url ?? '/auth/password-resets';
    const traceId =
      typeof req.headers['x-request-id'] === 'string'
        ? (req.headers['x-request-id'] as string)
        : 'password-reset';

    const result = await this.resetPasswordUseCase.execute({
      token: body.token,
      newPassword: body.new_password,
    });
    if (!isSuccess(result)) {
      projectResult(result, path, traceId);
    }
    // 204 sin body.
    return;
  }
}
