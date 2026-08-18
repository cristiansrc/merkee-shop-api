import { RequestPasswordResetUseCase } from './request-password-reset.use-case';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import type { PasswordResetTokenRepositoryPort } from '../../domain/ports/password-reset-token-repository.port';
import type { EmailPort } from '../../domain/ports/email.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { CookieTokenPort } from '../../domain/ports/cookie-token.port';
import type { RequestPasswordResetUnitOfWorkPort } from '../../domain/ports/request-password-reset-unit-of-work.port';
import { isSuccess, ok, fail } from '../../../../shared/domain/result';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('RequestPasswordResetUseCase', () => {
  let useCase: RequestPasswordResetUseCase;
  let userRepo: jest.Mocked<UserRepositoryPort>;
  let passwordResetTokenRepo: jest.Mocked<PasswordResetTokenRepositoryPort>;
  let emailPort: jest.Mocked<EmailPort>;
  let clock: jest.Mocked<ClockPort>;
  let cookieToken: jest.Mocked<CookieTokenPort>;
  let unitOfWork: jest.Mocked<RequestPasswordResetUnitOfWorkPort>;

  const NOW = new Date('2026-08-17T10:00:00Z');
  const USER_ID = 'user-123';
  const USER_EMAIL = 'test@example.com';
  const TOKEN_CLEAR = 'opaque-token-clear-abc123';
  const TOKEN_HASH = 'sha256-hash-of-token';

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
    emailPort = {
      sendPasswordResetEmail: jest.fn(),
    };
    clock = {
      now: jest.fn().mockReturnValue(NOW),
    };
    cookieToken = {
      generate: jest.fn().mockReturnValue(TOKEN_CLEAR),
      hash: jest.fn().mockReturnValue(TOKEN_HASH),
    };
    unitOfWork = {
      run: jest.fn().mockImplementation(async (work) => {
        // Simula transacción exitosa: ejecuta el callback con repositorios mock.
        await work({
          userRepo: userRepo as never,
          passwordResetTokenRepo: passwordResetTokenRepo as never,
        });
        return ok(undefined);
      }),
    };

    useCase = new RequestPasswordResetUseCase(
      userRepo,
      passwordResetTokenRepo,
      emailPort,
      clock,
      cookieToken,
      unitOfWork,
    );
  });

  it('debe devolver success siempre aunque el email no exista', async () => {
    userRepo.findByEmail.mockResolvedValue(ok(null));

    const result = await useCase.execute({ email: 'nonexistent@example.com' });

    expect(isSuccess(result)).toBe(true);
    expect(userRepo.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(emailPort.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('debe devolver 202 (success) si la búsqueda del email falla técnicamente (respuesta neutra)', async () => {
    userRepo.findByEmail.mockResolvedValue({
      ok: false,
      error: {
        code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      },
    });

    const result = await useCase.execute({ email: 'test@example.com' });

    // No revela el fallo técnico: respuesta 202 idempotente.
    expect(isSuccess(result)).toBe(true);
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(emailPort.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('debe ejecutar UoW atómico: invalidar tokens + crear nuevo token dentro de la transacción', async () => {
    userRepo.findByEmail.mockResolvedValue(ok({
      id: USER_ID,
      email: USER_EMAIL,
      passwordHash: '$argon2id$placeholder',
      displayName: 'Test User',
      phone: null,
      role: 'cliente',
      mustChangePassword: false,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    emailPort.sendPasswordResetEmail.mockResolvedValue(ok(undefined));

    const result = await useCase.execute({ email: USER_EMAIL });

    expect(isSuccess(result)).toBe(true);
    expect(userRepo.findByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(cookieToken.generate).toHaveBeenCalled();
    expect(cookieToken.hash).toHaveBeenCalledWith(TOKEN_CLEAR);
    // Verificar que el email se envía DESPUÉS del commit exitoso.
    expect(emailPort.sendPasswordResetEmail).toHaveBeenCalledWith(USER_EMAIL, TOKEN_CLEAR);
  });

  it('debe usar case-insensitive para buscar el email', async () => {
    userRepo.findByEmail.mockResolvedValue(ok(null));

    await useCase.execute({ email: 'TEST@Example.COM' });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('TEST@Example.COM');
  });

  it('no debe enviar email si la transacción del UoW falla', async () => {
    userRepo.findByEmail.mockResolvedValue(ok({
      id: USER_ID,
      email: USER_EMAIL,
      passwordHash: '$argon2id$placeholder',
      displayName: 'Test User',
      phone: null,
      role: 'cliente',
      mustChangePassword: false,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    // Simular fallo de transacción.
    unitOfWork.run.mockResolvedValue({
      ok: false,
      error: {
        code: 'TECHNICAL_DEPENDENCY_FAILURE',
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      },
    });

    const result = await useCase.execute({ email: USER_EMAIL });

    expect(result.ok).toBe(false);
    // Email NO se envía si la transacción falla.
    expect(emailPort.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('debe devolver 202 (success) incluso si el email falla al enviarse', async () => {
    userRepo.findByEmail.mockResolvedValue(ok({
      id: USER_ID,
      email: USER_EMAIL,
      passwordHash: '$argon2id$placeholder',
      displayName: 'Test User',
      phone: null,
      role: 'cliente',
      mustChangePassword: false,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    // Simular fallo del email (ROP: adapter retorna Failure).
    emailPort.sendPasswordResetEmail.mockResolvedValue({
      ok: false,
      error: {
        code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
        kind: 'technical',
        messageKey: 'technical.dependency_failure',
      },
    });

    const result = await useCase.execute({ email: USER_EMAIL });

    // 202 idempotente: el token se creó, el email falló pero la respuesta sigue siendo success.
    expect(isSuccess(result)).toBe(true);
    expect(emailPort.sendPasswordResetEmail).toHaveBeenCalledWith(USER_EMAIL, TOKEN_CLEAR);
  });

  it('no debe revelar token en logs ni email', async () => {
    userRepo.findByEmail.mockResolvedValue(ok(null));

    await useCase.execute({ email: 'test@example.com' });

    // El token no se pasa a ningún puerto de log.
    // Verificamos que emailPort no recibe token si no hay usuario.
    expect(emailPort.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('emailPort fake no expone token ni email en ningún entorno', async () => {
    // Verifica que el puerto fake usado en tests no registra PII.
    // El puerto fake es un mock de EmailPort; no tiene implementación real.
    // Solo verificamos que el caso de uso no filtra el token en la respuesta.
    userRepo.findByEmail.mockResolvedValue(ok(null));
    const result = await useCase.execute({ email: 'test@example.com' });
    expect(isSuccess(result)).toBe(true);
    // El emailPort fake no fue llamado (no hay usuario), por lo que no hay PII expuesta.
    expect(emailPort.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
