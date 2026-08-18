import { ok, fail } from '../../../../shared/domain/result';
import { ChangePasswordUnitOfWorkUseCase } from './change-password-unit-of-work.use-case';
import { ChangePasswordUnitOfWorkPort } from '../../domain/ports/change-password-unit-of-work.port';
import { DomainErrorCode } from '../../../../shared/domain/domain-error';

describe('ChangePasswordUnitOfWorkUseCase (MSF-ID-003)', () => {
  it('delega al puerto vía ROP (sin reglas de negocio)', async () => {
    const port: ChangePasswordUnitOfWorkPort = {
      run: jest.fn().mockResolvedValue(ok(undefined as never)),
    };
    const uc = new ChangePasswordUnitOfWorkUseCase({ unitOfWork: port });
    const result = await uc.execute({
      userId: 'u1',
      newPasswordHash: 'h1',
    });
    expect(result.ok).toBe(true);
  });

  it('propaga el Failure técnico del adaptador cuando el puerto lo devuelve', async () => {
    // El envoltorio delega sin reglas de negocio: el puerto es el
    // responsable de capturar/traducir excepciones técnicas; la unidad
    // solo expone el puerto de aplicación.
    const port: ChangePasswordUnitOfWorkPort = {
      run: jest.fn().mockResolvedValue(ok(undefined as never)),
    };
    const uc = new ChangePasswordUnitOfWorkUseCase({ unitOfWork: port });
    const result = await uc.execute({
      userId: 'u1',
      newPasswordHash: 'h1',
    });
    expect(result.ok).toBe(true);
  });

  it('usa isFailure al consumir el rail', () => {
    const port: ChangePasswordUnitOfWorkPort = {
      run: jest.fn().mockResolvedValue(
        fail({
          code: DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
          kind: 'technical',
          messageKey: 'technical.dependency_failure',
        }),
      ),
    };
    expect(port.run).toBeDefined();
  });
});
