import { Session, CreateSessionData, SessionKind } from '../models/session';
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de salida de repositorio de sesiones del módulo `identity`.
 * Abstrae la persistencia de sesiones de servidor. La implementación concreta (Prisma) vive en infrastructure.
 *
 * Cada método devuelve `Result<T, DomainError>`: el adapter captura excepciones
 * técnicas en su límite, las registra sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
export interface SessionRepositoryPort {
  /** Crea una sesión y devuelve la entidad persistida. */
  create(data: CreateSessionData): Promise<Result<Session, DomainError>>;
  /** Busca una sesión por ID. */
  findById(id: string): Promise<Result<Session | null, DomainError>>;
  /** Busca una sesión por el hash del refresh token. */
  findByRefreshTokenHash(hash: string): Promise<Result<Session | null, DomainError>>;
  /** Busca una sesión por ID de usuario y la devuelve si no está revocada ni ha expirado. */
  findActiveByUserId(userId: string, now: Date): Promise<Result<Session | null, DomainError>>;
  /** Lista sesiones no revocadas de un usuario (excluyendo opcionalmente una sesión). */
  findActiveByUserIdExcluding(
    userId: string,
    excludeSessionId: string,
  ): Promise<Result<Session[], DomainError>>;
  /** Rota el refresh token de una sesión (nuevo hash + expiración). */
  rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
  ): Promise<Result<Session, DomainError>>;
  /** Renueva la actividad de una sesión (lastActivityAt/expiración). */
  touchActivity(sessionId: string, now: Date): Promise<Result<void, DomainError>>;
  /** Revoca una sesión (establece `revokedAt`). */
  revoke(sessionId: string): Promise<Result<void, DomainError>>;
  /** Revoca todas las sesiones activas de un usuario. */
  revokeAllForUser(userId: string): Promise<Result<void, DomainError>>;
  /** Revoca todas las sesiones activas excepto la indicada (conserva actual). */
  revokeAllForUserExcept(userId: string, exceptSessionId: string): Promise<Result<void, DomainError>>;
}

/** Tipo de sesión reexportado para conveniencia del puerto. */
export type { Session, CreateSessionData, SessionKind };
