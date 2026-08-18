import { Result, ok, fail, isFailure } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import { CartReservationPort } from '../../domain/ports/cart-reservation.port';
import {
  sessionNotFoundOrExpired,
  technicalFailure,
} from '../../domain/identity-errors';

/** Comando de entrada del caso de uso de logout. */
export interface LogoutCommand {
  /** ID de la sesión a revocar (extraído del JWT). */
  readonly sessionId: string;
}

/**
 * Caso de uso de logout (MSF-ID-001).
 *
 * Revoca la sesión actual y libera todas las reservas ACTIVE del
 * carrito asociado. Es idempotente: revocar una sesión ya revocada
 * o liberar reservas ya liberadas no produce error.
 *
 * No toca reservas CHECKOUT_PENDING.
 *
 * ROP: todos los puertos devuelven `Result`; la aplicación propaga
 * el rail `Failure` sin capturar excepciones técnicas (Master Spec §ROP).
 */
export class LogoutUseCase {
  constructor(
    private readonly sessionRepo: SessionRepositoryPort,
    private readonly cartReservation: CartReservationPort,
  ) {}

  async execute(
    command: LogoutCommand,
  ): Promise<Result<void, DomainError>> {
    // 1. Buscar sesión
    const sessionResult = await this.sessionRepo.findById(command.sessionId);
    if (isFailure(sessionResult)) return sessionResult;
    const session = sessionResult.value;

    if (!session) {
      return fail(sessionNotFoundOrExpired());
    }

    // 2. Si ya está revocada, es idempotente (éxito sin cambios)
    if (session.revokedAt) {
      return ok(undefined);
    }

    // 3. Liberar reservas ACTIVE del carrito (no CHECKOUT_PENDING)
    const releaseResult = await this.cartReservation.releaseActiveReservations(session.id);
    if (isFailure(releaseResult)) return releaseResult;

    // 4. Revocar sesión
    const revokeResult = await this.sessionRepo.revoke(session.id);
    if (isFailure(revokeResult)) return revokeResult;

    return ok(undefined);
  }
}
