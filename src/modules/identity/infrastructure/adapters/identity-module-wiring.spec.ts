import { Test } from '@nestjs/testing';
import { IdentityModule } from '../../identity.module';
import { IDENTITY_TOKENS } from '../../identity.tokens';
import { PrismaUserRepositoryAdapter } from './prisma-user-repository.adapter';
import { PrismaSessionRepositoryAdapter } from './prisma-session-repository.adapter';
import { Argon2PasswordHasherAdapter } from './argon2-password-hasher.adapter';
import { SystemClockAdapter } from './system-clock.adapter';
import { PrismaChangePasswordUnitOfWorkAdapter } from './prisma-change-password-unit-of-work.adapter';
import { PrismaRequestPasswordResetUnitOfWorkAdapter } from './prisma-request-password-reset-unit-of-work.adapter';
import { PrometheusCartReaperMetricsAdapter } from '../../../cart-reservation/infrastructure/adapters/prometheus-cart-reaper-metrics.adapter';

describe('IdentityModule wiring (MSF-ID-003)', () => {
  beforeEach(() => {
    PrometheusCartReaperMetricsAdapter.clearMetrics();
  });

  it('provee USER_REPOSITORY como PrismaUserRepositoryAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const repo = moduleRef.get(IDENTITY_TOKENS.USER_REPOSITORY);
    expect(repo).toBeInstanceOf(PrismaUserRepositoryAdapter);
  });

  it('provee SESSION_REPOSITORY como PrismaSessionRepositoryAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const repo = moduleRef.get(IDENTITY_TOKENS.SESSION_REPOSITORY);
    expect(repo).toBeInstanceOf(PrismaSessionRepositoryAdapter);
  });

  it('provee PASSWORD_HASHER como Argon2PasswordHasherAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const hasher = moduleRef.get(IDENTITY_TOKENS.PASSWORD_HASHER);
    expect(hasher).toBeInstanceOf(Argon2PasswordHasherAdapter);
  });

  it('provee CLOCK como SystemClockAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const clock = moduleRef.get(IDENTITY_TOKENS.CLOCK);
    expect(clock).toBeInstanceOf(SystemClockAdapter);
  });

  it('provee CHANGE_PASSWORD_UNIT_OF_WORK como PrismaChangePasswordUnitOfWorkAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const uow = moduleRef.get(IDENTITY_TOKENS.CHANGE_PASSWORD_UNIT_OF_WORK);
    expect(uow).toBeInstanceOf(PrismaChangePasswordUnitOfWorkAdapter);
  });

  it('provee REQUEST_PASSWORD_RESET_UNIT_OF_WORK como PrismaRequestPasswordResetUnitOfWorkAdapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const uow = moduleRef.get(IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_UNIT_OF_WORK);
    expect(uow).toBeInstanceOf(PrismaRequestPasswordResetUnitOfWorkAdapter);
  });

  it('provee REFRESH_COOKIE_TTL_MS alineado con sesiones (10 minutos)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const ttl = moduleRef.get<number>(IDENTITY_TOKENS.REFRESH_COOKIE_TTL_MS);
    expect(ttl).toBe(10 * 60 * 1000);
  });

  it('construye los casos de uso sin importar NestJS/Prisma', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();
    const getUseCase = moduleRef.get(IDENTITY_TOKENS.GET_MY_PROFILE_USE_CASE);
    const updateUseCase = moduleRef.get(IDENTITY_TOKENS.UPDATE_PROFILE_USE_CASE);
    const changeUseCase = moduleRef.get(IDENTITY_TOKENS.CHANGE_PASSWORD_USE_CASE);
    const requestResetUseCase = moduleRef.get(IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_USE_CASE);
    expect(typeof getUseCase.execute).toBe('function');
    expect(typeof updateUseCase.execute).toBe('function');
    expect(typeof changeUseCase.execute).toBe('function');
    expect(typeof requestResetUseCase.execute).toBe('function');
  });
});
