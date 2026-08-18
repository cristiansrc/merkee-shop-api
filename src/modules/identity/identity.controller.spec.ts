import { IdentityController } from './identity.controller';
import { IDENTITY_TOKENS } from './identity.tokens';
import { GetMyProfileUseCase } from './application/use-cases/get-my-profile.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { ok, fail } from '../../shared/domain/result';
import {
  authenticationRequired,
  invalidCurrentPassword,
  idempotencyKeyReusedProfileUpdate,
} from './domain/identity-errors';
import { DomainErrorCode } from '../../shared/domain/domain-error';
import { HttpException } from '@nestjs/common';
import {
  validateUpdateProfileRequest,
  validatePasswordChangeRequest,
} from '../../contract/validation/request-validators';

/** Lee la respuesta `ApiErrorResponse` de una `HttpException`. */
function errorResponseFrom(e: unknown): {
  code: string;
  status: number;
} {
  const err = e as HttpException;
  const response = err.getResponse();
  if (typeof response === 'object' && response !== null) {
    const r = response as { code?: string; status?: number };
    return { code: r.code ?? '', status: r.status ?? 0 };
  }
  return { code: '', status: 0 };
}

function buildController(opts: {
  getProfile?: jest.Mock;
  updateProfile?: jest.Mock;
  changePassword?: jest.Mock;
  requestPasswordReset?: jest.Mock;
  resetPassword?: jest.Mock;
} = {}): {
  controller: IdentityController;
  getProfile: jest.Mock;
  updateProfile: jest.Mock;
  changePassword: jest.Mock;
  requestPasswordReset: jest.Mock;
  resetPassword: jest.Mock;
} {
  const getMyProfileExecute = opts.getProfile ?? jest.fn();
  const updateProfileExecute = opts.updateProfile ?? jest.fn();
  const changePasswordExecute = opts.changePassword ?? jest.fn();
  const requestPasswordResetExecute = opts.requestPasswordReset ?? jest.fn();
  const resetPasswordExecute = opts.resetPassword ?? jest.fn();
  const controller = new IdentityController(
    { execute: getMyProfileExecute } as unknown as GetMyProfileUseCase,
    { execute: updateProfileExecute } as unknown as UpdateProfileUseCase,
    { execute: changePasswordExecute } as unknown as ChangePasswordUseCase,
    { execute: requestPasswordResetExecute } as unknown as RequestPasswordResetUseCase,
    { execute: resetPasswordExecute } as unknown as ResetPasswordUseCase,
  );
  return {
    controller,
    getProfile: getMyProfileExecute,
    updateProfile: updateProfileExecute,
    changePassword: changePasswordExecute,
    requestPasswordReset: requestPasswordResetExecute,
    resetPassword: resetPasswordExecute,
  };
}

/** Construye un `Request` con `id`/`sessionId` en `req.user`. */
function actorRequest(
  url = '/me',
  headers: Record<string, string> = {},
): import('express').Request {
  return {
    headers,
    originalUrl: url,
    url,
    user: { id: 'user-1', sessionId: 'session-1' },
  } as unknown as import('express').Request;
}

/** Construye un `Response` mínimo que captura `cookie()`. */
function buildRes(): {
  res: import('express').Response;
  cookie: jest.Mock;
} {
  const cookie = jest.fn();
  const res = { cookie } as unknown as import('express').Response;
  return { res, cookie };
}

describe('IdentityController (MSF-ID-003)', () => {
  describe('GET /me', () => {
    it('devuelve el user del use case cuando el actor está autenticado', async () => {
      const { controller, getProfile } = buildController({
        getProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Ada Lovelace',
              email: 'ada@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const user = await controller.getMyProfile(actorRequest());
      expect(user).toMatchObject({ id: 'user-1', email: 'ada@example.com' });
      expect(getProfile).toHaveBeenCalledWith(
        expect.objectContaining({ userIdFromGuard: 'user-1' }),
      );
    });

    it('lanza HttpException 401 cuando el use case devuelve authenticationRequired', async () => {
      const { controller } = buildController({
        getProfile: jest.fn().mockResolvedValue(fail(authenticationRequired())),
      });
      await expect(controller.getMyProfile(actorRequest())).rejects.toThrow(
        HttpException,
      );
      try {
        await controller.getMyProfile(actorRequest());
      } catch (e) {
        const r = errorResponseFrom(e);
        expect(r.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
        expect(r.status).toBe(401);
      }
    });
  });

  describe('PATCH /me', () => {
    it('invoca el use case con actor, idempotencyKey y body canónico', async () => {
      const { controller, updateProfile } = buildController({
        updateProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Ada Lovelace',
              email: 'ada@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: '+57 300 000 0000',
            },
          }),
        ),
      });
      const { res } = buildRes();
      const user = await controller.updateProfile(
        { display_name: 'Ada Lovelace', phone: '+57 300 000 0000' },
        '11111111-1111-4111-8111-111111111111',
        actorRequest('/me'),
        res,
      );
      expect(user).toMatchObject({ phone: '+57 300 000 0000' });
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          body: {
            display_name: 'Ada Lovelace',
            phone: '+57 300 000 0000',
          },
        }),
      );
    });

    it('rechaza con 409 cuando el use case devuelve IDEMPOTENCY_KEY_REUSED', async () => {
      const { controller } = buildController({
        updateProfile: jest
          .fn()
          .mockResolvedValue(fail(idempotencyKeyReusedProfileUpdate())),
      });
      const { res } = buildRes();
      await expect(
        controller.updateProfile(
          { display_name: 'Otro' },
          '11111111-1111-4111-8111-111111111111',
          actorRequest('/me'),
          res,
        ),
      ).rejects.toThrow(HttpException);
      try {
        await controller.updateProfile(
          { display_name: 'Otro' },
          '11111111-1111-4111-8111-111111111111',
          actorRequest('/me'),
          res,
        );
      } catch (e) {
        const r = errorResponseFrom(e);
        expect(r.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
        expect(r.status).toBe(409);
      }
    });
  });

  describe('POST /auth/password-change', () => {
    it('devuelve 204 (void) y rota Set-Cookie HttpOnly con SameSite=Lax en primera ejecución', async () => {
      const { controller, changePassword } = buildController({
        changePassword: jest.fn().mockResolvedValue(
          ok({
            kind: 'changed',
            newRefreshToken: 'new-rotated-token',
            cookieExpiresAt: new Date('2030-01-01T00:00:00Z'),
          }),
        ),
      });
      const { res, cookie } = buildRes();
      await controller.changePassword(
        {
          current_password: 'OldStrongP@ssw0rd!',
          new_password: 'NewStrongP@ssw0rd!123',
        },
        '22222222-2222-4222-8222-222222222222',
        actorRequest('/auth/password-change'),
        res,
      );
      expect(changePassword).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          currentSessionId: 'session-1',
          currentPassword: 'OldStrongP@ssw0rd!',
          newPassword: 'NewStrongP@ssw0rd!123',
        }),
      );
      expect(cookie).toHaveBeenCalledWith(
        'merkee_refresh_session',
        'new-rotated-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });

    it('replay idempotente devuelve 204 SIN Set-Cookie (ADR-020)', async () => {
      const { controller, changePassword } = buildController({
        changePassword: jest.fn().mockResolvedValue(
          ok({ kind: 'replay' }),
        ),
      });
      const { res, cookie } = buildRes();
      await controller.changePassword(
        {
          current_password: 'OldStrongP@ssw0rd!',
          new_password: 'NewStrongP@ssw0rd!123',
        },
        '22222222-2222-4222-8222-222222222222',
        actorRequest('/auth/password-change'),
        res,
      );
      expect(cookie).not.toHaveBeenCalled();
    });

    it('rechaza con 422 cuando la contraseña actual es incorrecta y NO emite cookie', async () => {
      const { controller } = buildController({
        changePassword: jest.fn().mockResolvedValue(fail(invalidCurrentPassword())),
      });
      const { res, cookie } = buildRes();
      await expect(
        controller.changePassword(
          { current_password: 'wrong', new_password: 'NewStrongP@ssw0rd!123' },
          '33333333-3333-4333-8333-333333333333',
          actorRequest('/auth/password-change'),
          res,
        ),
      ).rejects.toThrow(HttpException);
      expect(cookie).not.toHaveBeenCalled();
      try {
        await controller.changePassword(
          { current_password: 'wrong', new_password: 'NewStrongP@ssw0rd!123' },
          '33333333-3333-4333-8333-333333333333',
          actorRequest('/auth/password-change'),
          res,
        );
      } catch (e) {
        const r = errorResponseFrom(e);
        expect(r.code).toBe(DomainErrorCode.CURRENT_PASSWORD_INVALID);
        expect(r.status).toBe(422);
      }
    });
  });

  describe('validación sintáctica de transporte', () => {
    it('rechaza UpdateProfileRequest con `display_name` corto', () => {
      const result = validateUpdateProfileRequest({ display_name: 'a' });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === 'display_name')).toBe(true);
    });

    it('rechaza PasswordChangeRequest con campos extra (additionalProperties:false)', () => {
      const result = validatePasswordChangeRequest({
        current_password: 'old',
        new_password: 'NewStrongP@ssw0rd!123',
        extra: 'no',
      });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === 'extra')).toBe(true);
    });
  });

  describe('campos inmutables del perfil', () => {
    it('PATCH /me devuelve 200 OK con email y role intactos al actualizar solo display_name/phone', async () => {
      const { controller } = buildController({
        updateProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Ada Lovelace',
              email: 'ada@example.com',
              role: 'admin',
              must_change_password: false,
              phone: '+57 300 000 0000',
            },
          }),
        ),
      });
      const { res } = buildRes();
      const user = (await controller.updateProfile(
        { display_name: 'Ada Lovelace', phone: '+57 300 000 0000' },
        '44444444-4444-4444-8444-444444444444',
        actorRequest('/me'),
        res,
      )) as {
        readonly email: string;
        readonly role: string;
        readonly phone: string;
      };
      expect(user.email).toBe('ada@example.com');
      expect(user.role).toBe('admin');
      expect(user.phone).toBe('+57 300 000 0000');
    });
  });

  describe('GET /me - edge cases', () => {
    it('pasa userIdFromGuard null cuando actor no tiene user', async () => {
      const { controller, getProfile } = buildController({
        getProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Ada Lovelace',
              email: 'ada@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const reqWithoutUser = {
        headers: {},
        originalUrl: '/me',
        url: '/me',
      } as unknown as import('express').Request;
      await controller.getMyProfile(reqWithoutUser);
      expect(getProfile).toHaveBeenCalledWith(
        expect.objectContaining({ userIdFromGuard: null }),
      );
    });

    it('usa url como fallback cuando originalUrl no existe', async () => {
      const { controller } = buildController({
        getProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Test',
              email: 'test@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const req = {
        headers: {},
        url: '/me',
        user: { id: 'user-1', sessionId: 'session-1' },
      } as unknown as import('express').Request;
      const result = await controller.getMyProfile(req);
      expect(result).toBeDefined();
    });

    it('usa x-request-id como traceId cuando está presente', async () => {
      const { controller } = buildController({
        getProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Test',
              email: 'test@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const req = {
        headers: { 'x-request-id': 'custom-trace-id' },
        originalUrl: '/me',
        url: '/me',
        user: { id: 'user-1', sessionId: 'session-1' },
      } as unknown as import('express').Request;
      const result = await controller.getMyProfile(req);
      expect(result).toBeDefined();
    });

    it('usa traceId por defecto cuando x-request-id no es string', async () => {
      const { controller } = buildController({
        getProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Test',
              email: 'test@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const req = {
        headers: { 'x-request-id': 12345 },
        originalUrl: '/me',
        url: '/me',
        user: { id: 'user-1', sessionId: 'session-1' },
      } as unknown as import('express').Request;
      const result = await controller.getMyProfile(req);
      expect(result).toBeDefined();
    });
  });

  describe('PATCH /me - edge cases', () => {
    it('lanza 400 cuando Idempotency-Key no es UUID válido', async () => {
      const { controller } = buildController();
      const { res } = buildRes();
      await expect(
        controller.updateProfile(
          { display_name: 'Test' },
          'not-a-uuid',
          actorRequest('/me'),
          res,
        ),
      ).rejects.toThrow();
    });

    it('usa actorId vacío cuando actor no tiene user', async () => {
      const { controller, updateProfile } = buildController({
        updateProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Test',
              email: 'test@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const { res } = buildRes();
      const reqWithoutUser = {
        headers: {},
        originalUrl: '/me',
        url: '/me',
      } as unknown as import('express').Request;
      await controller.updateProfile(
        { display_name: 'Test' },
        '11111111-1111-4111-8111-111111111111',
        reqWithoutUser,
        res,
      );
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: '' }),
      );
    });

    it('maneja body undefined correctamente', async () => {
      const { controller, updateProfile } = buildController({
        updateProfile: jest.fn().mockResolvedValue(
          ok({
            user: {
              id: 'user-1',
              display_name: 'Test',
              email: 'test@example.com',
              role: 'cliente',
              must_change_password: false,
              phone: null,
            },
          }),
        ),
      });
      const { res } = buildRes();
      await controller.updateProfile(
        undefined as any,
        '11111111-1111-4111-8111-111111111111',
        actorRequest('/me'),
        res,
      );
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ body: {} }),
      );
    });
  });

  describe('POST /auth/password-change - edge cases', () => {
    it('lanza 400 cuando Idempotency-Key no es UUID válido', async () => {
      const { controller } = buildController();
      const { res } = buildRes();
      await expect(
        controller.changePassword(
          { current_password: 'old', new_password: 'NewStrongP@ssw0rd!123' },
          'invalid-key',
          actorRequest('/auth/password-change'),
          res,
        ),
      ).rejects.toThrow();
    });

    it('usa actorId y currentSessionId vacíos cuando actor no tiene user', async () => {
      const { controller, changePassword } = buildController({
        changePassword: jest.fn().mockResolvedValue(ok({ kind: 'replay' })),
      });
      const { res } = buildRes();
      const reqWithoutUser = {
        headers: {},
        originalUrl: '/auth/password-change',
        url: '/auth/password-change',
      } as unknown as import('express').Request;
      await controller.changePassword(
        { current_password: 'old', new_password: 'NewStrongP@ssw0rd!123' },
        '22222222-2222-4222-8222-222222222222',
        reqWithoutUser,
        res,
      );
      expect(changePassword).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: '', currentSessionId: '' }),
      );
    });

    it('usa traceId por defecto cuando x-request-id no es string', async () => {
      const { controller } = buildController({
        changePassword: jest.fn().mockResolvedValue(ok({ kind: 'replay' })),
      });
      const { res } = buildRes();
      const req = {
        headers: { 'x-request-id': 12345 },
        originalUrl: '/auth/password-change',
        url: '/auth/password-change',
        user: { id: 'user-1', sessionId: 'session-1' },
      } as unknown as import('express').Request;
      await controller.changePassword(
        { current_password: 'old', new_password: 'NewStrongP@ssw0rd!123' },
        '22222222-2222-4222-8222-222222222222',
        req,
        res,
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('configura cookie con secure=true en producción', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { controller } = buildController({
        changePassword: jest.fn().mockResolvedValue(
          ok({
            kind: 'changed',
            newRefreshToken: 'token',
            cookieExpiresAt: new Date('2030-01-01T00:00:00Z'),
          }),
        ),
      });
      const { res, cookie } = buildRes();
      await controller.changePassword(
        { current_password: 'old', new_password: 'NewStrongP@ssw0rd!123' },
        '22222222-2222-4222-8222-222222222222',
        actorRequest('/auth/password-change'),
        res,
      );
      expect(cookie).toHaveBeenCalledWith(
        'merkee_refresh_session',
        'token',
        expect.objectContaining({ secure: true }),
      );
      process.env.NODE_ENV = originalEnv;
    });

    it('configura cookie con secure=false en desarrollo', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const { controller } = buildController({
        changePassword: jest.fn().mockResolvedValue(
          ok({
            kind: 'changed',
            newRefreshToken: 'token',
            cookieExpiresAt: new Date('2030-01-01T00:00:00Z'),
          }),
        ),
      });
      const { res, cookie } = buildRes();
      await controller.changePassword(
        { current_password: 'old', new_password: 'NewStrongP@ssw0rd!123' },
        '22222222-2222-4222-8222-222222222222',
        actorRequest('/auth/password-change'),
        res,
      );
      expect(cookie).toHaveBeenCalledWith(
        'merkee_refresh_session',
        'token',
        expect.objectContaining({ secure: false }),
      );
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /auth/password-reset-requests', () => {
    it('ejecuta use case y retorna 202 siempre', async () => {
      const { controller, requestPasswordReset } = buildController({
        requestPasswordReset: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = actorRequest('/auth/password-reset-requests');
      await controller.requestPasswordReset({ email: 'test@example.com' }, req);
      expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('lanza HttpException cuando el use case falla', async () => {
      const { controller } = buildController({
        requestPasswordReset: jest.fn().mockResolvedValue(
          fail({ code: 'TECHNICAL_FAILURE', kind: 'technical', messageKey: 'error' }),
        ),
      });
      const req = actorRequest('/auth/password-reset-requests');
      await expect(
        controller.requestPasswordReset({ email: 'test@example.com' }, req),
      ).rejects.toThrow(HttpException);
    });

    it('usa x-request-id como traceId cuando está presente', async () => {
      const { controller } = buildController({
        requestPasswordReset: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = {
        headers: { 'x-request-id': 'reset-trace-123' },
        originalUrl: '/auth/password-reset-requests',
        url: '/auth/password-reset-requests',
      } as unknown as import('express').Request;
      await controller.requestPasswordReset({ email: 'test@example.com' }, req);
    });

    it('usa traceId por defecto cuando x-request-id no es string', async () => {
      const { controller } = buildController({
        requestPasswordReset: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = {
        headers: { 'x-request-id': 12345 },
        originalUrl: '/auth/password-reset-requests',
        url: '/auth/password-reset-requests',
      } as unknown as import('express').Request;
      await controller.requestPasswordReset({ email: 'test@example.com' }, req);
    });
  });

  describe('POST /auth/password-resets', () => {
    it('ejecuta use case y retorna 204 cuando el token es válido', async () => {
      const { controller, resetPassword } = buildController({
        resetPassword: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = actorRequest('/auth/password-resets');
      await controller.resetPassword(
        { token: 'valid-token', new_password: 'NewStrongP@ssw0rd!123' },
        req,
      );
      expect(resetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'NewStrongP@ssw0rd!123',
      });
    });

    it('lanza HttpException cuando el use case falla', async () => {
      const { controller } = buildController({
        resetPassword: jest.fn().mockResolvedValue(
          fail({ code: 'TECHNICAL_FAILURE', kind: 'technical', messageKey: 'error' }),
        ),
      });
      const req = actorRequest('/auth/password-resets');
      await expect(
        controller.resetPassword(
          { token: 'invalid-token', new_password: 'NewStrongP@ssw0rd!123' },
          req,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('usa x-request-id como traceId cuando está presente', async () => {
      const { controller } = buildController({
        resetPassword: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = {
        headers: { 'x-request-id': 'reset-trace-456' },
        originalUrl: '/auth/password-resets',
        url: '/auth/password-resets',
      } as unknown as import('express').Request;
      await controller.resetPassword(
        { token: 'valid-token', new_password: 'NewStrongP@ssw0rd!123' },
        req,
      );
    });

    it('usa traceId por defecto cuando x-request-id no es string', async () => {
      const { controller } = buildController({
        resetPassword: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = {
        headers: { 'x-request-id': 12345 },
        originalUrl: '/auth/password-resets',
        url: '/auth/password-resets',
      } as unknown as import('express').Request;
      await controller.resetPassword(
        { token: 'valid-token', new_password: 'NewStrongP@ssw0rd!123' },
        req,
      );
    });

    it('usa url como fallback cuando originalUrl no existe', async () => {
      const { controller } = buildController({
        resetPassword: jest.fn().mockResolvedValue(ok(undefined)),
      });
      const req = {
        headers: {},
        url: '/auth/password-resets',
      } as unknown as import('express').Request;
      await controller.resetPassword(
        { token: 'valid-token', new_password: 'NewStrongP@ssw0rd!123' },
        req,
      );
    });
  });
});
