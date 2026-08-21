import { Global, Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../cart-reservation/infrastructure/prisma.module';
import { CartReservationModule } from '../cart-reservation/cart-reservation.module';
import { CART_TOKENS } from '../cart-reservation/cart-reservation.tokens';
import { IDENTITY_TOKENS } from './identity.tokens';
import { GetMyProfileUseCase } from './application/use-cases/get-my-profile.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ChangePasswordUnitOfWorkUseCase } from './application/use-cases/change-password-unit-of-work.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { IdentityController } from './identity.controller';
import { PrismaUserRepositoryAdapter } from './infrastructure/adapters/prisma-user-repository.adapter';
import { PrismaSessionRepositoryAdapter } from './infrastructure/adapters/prisma-session-repository.adapter';
import { Argon2PasswordHasherAdapter } from './infrastructure/adapters/argon2-password-hasher.adapter';
import { JwtAdapter } from './infrastructure/adapters/jwt.adapter';
import { CookieTokenAdapter } from './infrastructure/adapters/cookie-token.adapter';
import { SystemClockAdapter } from './infrastructure/adapters/system-clock.adapter';
import { PrismaIdempotencyAdapter } from './infrastructure/adapters/prisma-idempotency.adapter';
import { PrismaChangePasswordUnitOfWorkAdapter } from './infrastructure/adapters/prisma-change-password-unit-of-work.adapter';
import { PrismaPasswordResetTokenRepositoryAdapter } from './infrastructure/adapters/prisma-password-reset-token-repository.adapter';
import { NoopEmailAdapter } from './infrastructure/adapters/noop-email.adapter';
import { PrismaResetPasswordUnitOfWorkAdapter } from './infrastructure/adapters/prisma-reset-password-unit-of-work.adapter';
import { PrismaRequestPasswordResetUnitOfWorkAdapter } from './infrastructure/adapters/prisma-request-password-reset-unit-of-work.adapter';
import { PrismaUpdateProfileUnitOfWorkAdapter } from './infrastructure/adapters/prisma-update-profile-unit-of-work.adapter';
import { UserRepositoryPort } from './domain/ports/user-repository.port';
import { SessionRepositoryPort } from './domain/ports/session-repository.port';
import { PasswordHasherPort } from './domain/ports/password-hasher.port';
import { JwtPort } from './domain/ports/jwt.port';
import { CookieTokenPort } from './domain/ports/cookie-token.port';
import { ClockPort } from './domain/ports/clock.port';
import { IdempotencyPort } from './domain/ports/idempotency.port';
import { ChangePasswordUnitOfWorkPort } from './domain/ports/change-password-unit-of-work.port';
import { UpdateProfileUnitOfWorkPort } from './domain/ports/update-profile-unit-of-work.port';
import { PasswordResetTokenRepositoryPort } from './domain/ports/password-reset-token-repository.port';
import { EmailPort } from './domain/ports/email.port';
import { ResetPasswordUnitOfWorkPort } from './domain/ports/reset-password-unit-of-work.port';
import { RequestPasswordResetUnitOfWorkPort } from './domain/ports/request-password-reset-unit-of-work.port';
import { CartReservationPort } from './domain/ports/cart-reservation.port';
import { SESSION_INACTIVITY_TTL_MS } from './domain/session.config';

/** TTL del cookie rotado de refresh alineado con sesiones (30 minutos de inactividad). */
const DEFAULT_REFRESH_COOKIE_TTL_MS = SESSION_INACTIVITY_TTL_MS;

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → Prisma)
// ---------------------------------------------------------------------------

const userRepositoryProvider: Provider = {
  provide: IDENTITY_TOKENS.USER_REPOSITORY,
  useClass: PrismaUserRepositoryAdapter,
};

const sessionRepositoryProvider: Provider = {
  provide: IDENTITY_TOKENS.SESSION_REPOSITORY,
  useClass: PrismaSessionRepositoryAdapter,
};

const passwordHasherProvider: Provider = {
  provide: IDENTITY_TOKENS.PASSWORD_HASHER,
  useClass: Argon2PasswordHasherAdapter,
};

const jwtProvider: Provider = {
  provide: IDENTITY_TOKENS.JWT,
  useClass: JwtAdapter,
};

const cookieTokenProvider: Provider = {
  provide: IDENTITY_TOKENS.COOKIE_TOKEN,
  useClass: CookieTokenAdapter,
};

const clockProvider: Provider = {
  provide: IDENTITY_TOKENS.CLOCK,
  useClass: SystemClockAdapter,
};

const idempotencyProvider: Provider = {
  provide: IDENTITY_TOKENS.IDEMPOTENCY,
  useClass: PrismaIdempotencyAdapter,
};

const changePasswordUnitOfWorkProvider: Provider = {
  provide: IDENTITY_TOKENS.CHANGE_PASSWORD_UNIT_OF_WORK,
  useClass: PrismaChangePasswordUnitOfWorkAdapter,
};

const passwordResetTokenRepositoryProvider: Provider = {
  provide: IDENTITY_TOKENS.PASSWORD_RESET_TOKEN_REPOSITORY,
  useClass: PrismaPasswordResetTokenRepositoryAdapter,
};

const emailProvider: Provider = {
  provide: IDENTITY_TOKENS.EMAIL,
  useClass: NoopEmailAdapter,
};

const resetPasswordUnitOfWorkProvider: Provider = {
  provide: IDENTITY_TOKENS.RESET_PASSWORD_UNIT_OF_WORK,
  useClass: PrismaResetPasswordUnitOfWorkAdapter,
};

const requestPasswordResetUnitOfWorkProvider: Provider = {
  provide: IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_UNIT_OF_WORK,
  useClass: PrismaRequestPasswordResetUnitOfWorkAdapter,
};

const updateProfileUnitOfWorkProvider: Provider = {
  provide: IDENTITY_TOKENS.UPDATE_PROFILE_UNIT_OF_WORK,
  useClass: PrismaUpdateProfileUnitOfWorkAdapter,
};

// ---------------------------------------------------------------------------
// Provider de CartReservationPort (MSF-CART-002): adapter real
// ---------------------------------------------------------------------------

const cartReservationProvider: Provider = {
  provide: IDENTITY_TOKENS.CART_RESERVATION,
  useExisting: CART_TOKENS.TRANSITION_GUEST_TO_ADMIN,
};

// ---------------------------------------------------------------------------
// Providers de use cases (MSF-ID-003): construidos sobre tokens de ports
// ---------------------------------------------------------------------------

const getMyProfileUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.GET_MY_PROFILE_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    sessionRepo: SessionRepositoryPort,
    clock: ClockPort,
  ): GetMyProfileUseCase =>
    new GetMyProfileUseCase({
      userRepo,
      sessionRepo,
      clock,
    }),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.SESSION_REPOSITORY,
    IDENTITY_TOKENS.CLOCK,
  ],
};

const updateProfileUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.UPDATE_PROFILE_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    idempotency: IdempotencyPort,
    unitOfWork: UpdateProfileUnitOfWorkPort,
  ): UpdateProfileUseCase =>
    new UpdateProfileUseCase({ userRepo, idempotency, unitOfWork }),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.IDEMPOTENCY,
    IDENTITY_TOKENS.UPDATE_PROFILE_UNIT_OF_WORK,
  ],
};

const changePasswordUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.CHANGE_PASSWORD_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    sessionRepo: SessionRepositoryPort,
    passwordHasher: PasswordHasherPort,
    jwt: JwtPort,
    cookieToken: CookieTokenPort,
    clock: ClockPort,
    idempotency: IdempotencyPort,
    unitOfWork: ChangePasswordUnitOfWorkPort,
  ): ChangePasswordUseCase =>
    new ChangePasswordUseCase({
      userRepo,
      sessionRepo,
      passwordHasher,
      jwt,
      cookieToken,
      clock,
      idempotency,
      unitOfWork,
      refreshCookieTtlMs: DEFAULT_REFRESH_COOKIE_TTL_MS,
    }),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.SESSION_REPOSITORY,
    IDENTITY_TOKENS.PASSWORD_HASHER,
    IDENTITY_TOKENS.JWT,
    IDENTITY_TOKENS.COOKIE_TOKEN,
    IDENTITY_TOKENS.CLOCK,
    IDENTITY_TOKENS.IDEMPOTENCY,
    IDENTITY_TOKENS.CHANGE_PASSWORD_UNIT_OF_WORK,
  ],
};

const refreshCookieTtlProvider: Provider = {
  provide: IDENTITY_TOKENS.REFRESH_COOKIE_TTL_MS,
  useValue: DEFAULT_REFRESH_COOKIE_TTL_MS,
};

const requestPasswordResetUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    passwordResetTokenRepo: PasswordResetTokenRepositoryPort,
    emailPort: EmailPort,
    clock: ClockPort,
    cookieToken: CookieTokenPort,
    unitOfWork: RequestPasswordResetUnitOfWorkPort,
  ): RequestPasswordResetUseCase =>
    new RequestPasswordResetUseCase(
      userRepo,
      passwordResetTokenRepo,
      emailPort,
      clock,
      cookieToken,
      unitOfWork,
    ),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.PASSWORD_RESET_TOKEN_REPOSITORY,
    IDENTITY_TOKENS.EMAIL,
    IDENTITY_TOKENS.CLOCK,
    IDENTITY_TOKENS.COOKIE_TOKEN,
    IDENTITY_TOKENS.REQUEST_PASSWORD_RESET_UNIT_OF_WORK,
  ],
};

const resetPasswordUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.RESET_PASSWORD_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    passwordResetTokenRepo: PasswordResetTokenRepositoryPort,
    passwordHasher: PasswordHasherPort,
    clock: ClockPort,
    cookieToken: CookieTokenPort,
    unitOfWork: ResetPasswordUnitOfWorkPort,
  ): ResetPasswordUseCase =>
    new ResetPasswordUseCase(
      userRepo,
      passwordResetTokenRepo,
      passwordHasher,
      clock,
      cookieToken,
      unitOfWork,
    ),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.PASSWORD_RESET_TOKEN_REPOSITORY,
    IDENTITY_TOKENS.PASSWORD_HASHER,
    IDENTITY_TOKENS.CLOCK,
    IDENTITY_TOKENS.COOKIE_TOKEN,
    IDENTITY_TOKENS.RESET_PASSWORD_UNIT_OF_WORK,
  ],
};

const loginUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.LOGIN_USE_CASE,
  useFactory: (
    userRepo: UserRepositoryPort,
    sessionRepo: SessionRepositoryPort,
    passwordHasher: PasswordHasherPort,
    jwt: JwtPort,
    cookieToken: CookieTokenPort,
    clock: ClockPort,
    cartReservation: CartReservationPort,
  ): LoginUseCase =>
    new LoginUseCase(
      userRepo,
      sessionRepo,
      passwordHasher,
      jwt,
      cookieToken,
      clock,
      cartReservation,
    ),
  inject: [
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.SESSION_REPOSITORY,
    IDENTITY_TOKENS.PASSWORD_HASHER,
    IDENTITY_TOKENS.JWT,
    IDENTITY_TOKENS.COOKIE_TOKEN,
    IDENTITY_TOKENS.CLOCK,
    IDENTITY_TOKENS.CART_RESERVATION,
  ],
};

const refreshSessionUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.REFRESH_SESSION_USE_CASE,
  useFactory: (
    sessionRepo: SessionRepositoryPort,
    userRepo: UserRepositoryPort,
    jwt: JwtPort,
    cookieToken: CookieTokenPort,
    clock: ClockPort,
  ): RefreshSessionUseCase =>
    new RefreshSessionUseCase(
      sessionRepo,
      userRepo,
      jwt,
      cookieToken,
      clock,
    ),
  inject: [
    IDENTITY_TOKENS.SESSION_REPOSITORY,
    IDENTITY_TOKENS.USER_REPOSITORY,
    IDENTITY_TOKENS.JWT,
    IDENTITY_TOKENS.COOKIE_TOKEN,
    IDENTITY_TOKENS.CLOCK,
  ],
};

const logoutUseCaseProvider: Provider = {
  provide: IDENTITY_TOKENS.LOGOUT_USE_CASE,
  useFactory: (
    sessionRepo: SessionRepositoryPort,
    cartReservation: CartReservationPort,
  ): LogoutUseCase =>
    new LogoutUseCase(sessionRepo, cartReservation),
  inject: [
    IDENTITY_TOKENS.SESSION_REPOSITORY,
    IDENTITY_TOKENS.CART_RESERVATION,
  ],
};

/**
 * Módulo `identity` (MSF-ID-003).
 *
 * Declara el controller HTTP con los endpoints `GET /me`, `PATCH /me`,
 * `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
 * `POST /auth/password-change`, `POST /auth/password-reset-requests` y
 * `POST /auth/password-resets`, y construye los use cases de aplicación
 * sobre los tokens de los ports. Los adapters de salida se cablean aquí
 * para que DI pueda resolver todas las dependencias sin que el dominio
 * ni la aplicación conozcan NestJS o Prisma.
 */
@Global()
@Module({
  imports: [PrismaModule, CartReservationModule],
  controllers: [IdentityController],
  providers: [
    // Adapters de salida
    userRepositoryProvider,
    sessionRepositoryProvider,
    passwordHasherProvider,
    jwtProvider,
    cookieTokenProvider,
    clockProvider,
    idempotencyProvider,
    changePasswordUnitOfWorkProvider,
    updateProfileUnitOfWorkProvider,
    passwordResetTokenRepositoryProvider,
    emailProvider,
    resetPasswordUnitOfWorkProvider,
    requestPasswordResetUnitOfWorkProvider,
    cartReservationProvider,
    // Use cases
    getMyProfileUseCaseProvider,
    updateProfileUseCaseProvider,
    changePasswordUseCaseProvider,
    requestPasswordResetUseCaseProvider,
    resetPasswordUseCaseProvider,
    loginUseCaseProvider,
    refreshSessionUseCaseProvider,
    logoutUseCaseProvider,
    // Configuración
    refreshCookieTtlProvider,
  ],
  // DEC-06: el TransportAuthGuard (shared/http) consume `JwtPort` por el
  // símbolo `IDENTITY_TOKENS.JWT` y se usa en identity, media y catalog.
  // Exportar el token (con módulo @Global) lo hace resolvable en todos los
  // módulos sin acoplar media/catalog a toda la DI de identity.
  exports: [IDENTITY_TOKENS.JWT],
})
export class IdentityModule {}
