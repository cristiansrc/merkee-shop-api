import { ResetPasswordUseCase } from './reset-password.use-case';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import type { PasswordResetTokenRepositoryPort } from '../../domain/ports/password-reset-token-repository.port';
import type { ResetPasswordUnitOfWorkPort } from '../../domain/ports/reset-password-unit-of-work.port';
import type { PasswordHasherPort } from '../../domain/ports/password-hasher.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import { isSuccess, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let userRepo: jest.Mocked<UserRepositoryPort>;
  let passwordResetTokenRepo: jest.Mocked<PasswordResetTokenRepositoryPort>;
  let passwordHasher: jest.Mocked<PasswordHasherPort>;
  let clock: jest.Mocked<ClockPort>;
  let cookieToken: jest.Mocked<CookieTokenPort>;
  let unitOfWork: jest.Mocked<ResetPasswordUnitOfWorkPort>;

  const NOW = new Date('2026-08-17T10:00:00Z');
  const TOKEN_CLEAR = 'opaque-token-abc123';
  const TOKEN_HASH = 'sha256-hash-of-token';
  const TOKEN_ID = 'token-123';
  const USER_ID = 'user-123';
  const NEW_PASSWORD = 'new-secure-password-123';
  const NEW_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$hashedpassword';

  beforeEach(() => {
    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createAdmin: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
    };
    passwordResetTokenRepo = {
      invalidateAllActiveForUser: jest.fn(),
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      markAsUsed: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue(ok(NEW_PASSWORD_HASH)),
      verify: jest.fn(),
    };
    clock = {
      now: jest.fn().mockReturnValue(NOW),
    };
    cookieToken = {
      generate: jest.fn(),
      hash: jest.fn().mockReturnValue(TOKEN_HASH),
    };
    unitOfWork = {
      run: jest.fn(),
    };

    useCase = new ResetPasswordUseCase(
      userRepo,
      passwordResetTokenRepo,
      passwordHasher,
      clock,
      cookieToken,
      unitOfWork,
    );
  });

  it('debe devolver 422 si el token no existe', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue(null);

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
    expect(cookieToken.hash).toHaveBeenCalledWith(TOKEN_CLEAR);
    expect(passwordResetTokenRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('debe devolver 422 si el token ya fue usado', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('debe devolver 422 si el token está expirado', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() - 1 * 60 * 1000), // Expirado hace 1 minuto
      usedAt: null,
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('debe ejecutar la transacción atómica con token válido', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });

    unitOfWork.run.mockImplementation(async (work: (tx: any) => Promise<any>) => {
      const tx = {
        userRepo,
        sessionRepo: {
          revokeAllForUser: jest.fn(),
        } as any,
        passwordResetTokenRepo: {
          markAsUsed: jest.fn().mockResolvedValue(ok(true)),
        } as any,
      };
      await work(tx);
      return { ok: true, value: undefined } as any;
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isSuccess(result)).toBe(true);
    expect(passwordHasher.hash).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(unitOfWork.run).toHaveBeenCalled();
  });

  it('debe pasar clock.now() a markAsUsed para verificación atómica de expiración', async () => {
    const expiresAt = new Date(NOW.getTime() + 30 * 60 * 1000);
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt,
      usedAt: null,
    });

    const markAsUsedSpy = jest.fn().mockResolvedValue(true);
    unitOfWork.run.mockImplementation(async (work: (tx: any) => Promise<any>) => {
      const tx = {
        userRepo,
        sessionRepo: { revokeAllForUser: jest.fn() } as any,
        passwordResetTokenRepo: { markAsUsed: markAsUsedSpy } as any,
      };
      await work(tx);
      return { ok: true, value: undefined } as any;
    });

    await useCase.execute({ token: TOKEN_CLEAR, newPassword: NEW_PASSWORD });

    // markAsUsed debe recibir el tokenId Y el now del clock
    expect(markAsUsedSpy).toHaveBeenCalledWith(TOKEN_ID, NOW);
  });

  it('debe devolver 422 si markAsUsed retorna false (expiración entre validación y consumo)', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });

    // markAsUsed retorna false: el token expiró o fue consumido entre la
    // validación del use case y la ejecución de markAsUsed en la transacción.
    unitOfWork.run.mockResolvedValue({
      ok: false,
      error: {
        code: 'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED',
        kind: 'unprocessable',
        messageKey: 'auth.password_reset_token_invalid_or_expired',
      },
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
  });

  it('debe devolver error si el consumo atómico falla (carrera)', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });

    // El adapter convierte el DomainError lanzado por el callback en Failure
    unitOfWork.run.mockResolvedValue({
      ok: false,
      error: {
        code: 'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED',
        kind: 'unprocessable',
        messageKey: 'auth.password_reset_token_invalid_or_expired',
      },
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
  });

  it('debe hashear la contraseña fuera de la transacción', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });

    unitOfWork.run.mockImplementation(async (work: (tx: any) => Promise<any>) => {
      const tx = {
        userRepo,
        sessionRepo: {
          revokeAllForUser: jest.fn(),
        } as any,
        passwordResetTokenRepo: {
          markAsUsed: jest.fn().mockResolvedValue(ok(true)),
        } as any,
      };
      await work(tx);
      return { ok: true, value: undefined } as any;
    });

    await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    // El hash se calcula ANTES de la transacción.
    expect(passwordHasher.hash).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
  });

  it('debe propagar el fallo del hasher de la nueva contraseña sin ejecutar la transacción', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });
    passwordHasher.hash.mockResolvedValue({
      ok: false,
      error: {
        code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      },
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    }
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('debe devolver 422 si markAsUsed retorna false dentro del callback transaccional', async () => {
    passwordResetTokenRepo.findByTokenHash.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      usedAt: null,
    });

    // El callback real se ejecuta: markAsUsed devuelve false (token consumido
    // o expirado entre la validación y el consumo atómico).
    unitOfWork.run.mockImplementation(async (work: (tx: any) => Promise<any>) => {
      const tx = {
        userRepo,
        sessionRepo: { revokeAllForUser: jest.fn() } as any,
        passwordResetTokenRepo: {
          markAsUsed: jest.fn().mockResolvedValue(false),
        } as any,
      };
      return work(tx);
    });

    const result = await useCase.execute({
      token: TOKEN_CLEAR,
      newPassword: NEW_PASSWORD,
    });

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      );
    }
  });
});
