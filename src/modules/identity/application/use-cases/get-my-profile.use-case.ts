import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { ClockPort } from '../../domain/ports/clock.port';
import {
  authenticationRequired,
  sessionNotFoundOrExpired,
  technicalFailure,
} from '../../domain/identity-errors';
import type { UserDto } from '../../../../contract/application/dto';

/** Comando de entrada para lectura de perfil (`GET /me`). */
export interface GetMyProfileCommand {
  /** JWT de acceso verificado o `null` si ausente/inválido. */
  readonly accessToken: string | null;
  /** ID del usuario autenticado si el guard lo extrajo; null en caso contrario. */
  readonly userIdFromGuard: string | null;
}

/** Resultado de éxito del caso de uso. */
export interface GetMyProfileResult {
  readonly user: UserDto;
}

interface GetMyProfileUseCasePorts {
  readonly userRepo: UserRepositoryPort;
  readonly sessionRepo: SessionRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * Caso de uso de lectura de perfil (`GET /me`, MSF-ID-003).
 *
 * Devuelve el `UserResponse` del usuario autenticado. La fuente de verdad
 * de `userId` la provee el `TransportAuthGuard` o el `JWT verify` del puerto
 * (no de cabeceras crudas). Solo `display_name` y `phone` son editables
 * (`PATCH /me`); `email`/`role`/`dirección` son inmutables por API.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class GetMyProfileUseCase {
  constructor(private readonly ports: GetMyProfileUseCasePorts) {}

  async execute(
    command: GetMyProfileCommand,
  ): Promise<Result<GetMyProfileResult, DomainError>> {
    const userId = command.userIdFromGuard;
    if (!userId) {
      return fail(authenticationRequired());
    }

    const userResult = await this.ports.userRepo.findById(userId);
    if (isFailure(userResult)) return userResult;
    const user = userResult.value;

    if (!user) {
      // Usuario borrado o revocado: no exponer existencia → 401 transporte.
      return fail(sessionNotFoundOrExpired());
    }

    // Tocar actividad de cualquier sesión AUTHENTICATED vigente del usuario
    // (cadena de reservas/cookies se renueva por el guard; aquí no tocamos
    // si el caller no aporta sessionId para mantener el caso puro).
    void this.ports.clock.now();

    return ok({
      user: {
        id: user.id,
        display_name: user.displayName,
        email: user.email,
        role: user.role,
        must_change_password: user.mustChangePassword,
        phone: user.phone,
      },
    });
  }
}
