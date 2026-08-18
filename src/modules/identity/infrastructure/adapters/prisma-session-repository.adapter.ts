import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { SessionRepositoryPort } from '../../domain/ports/session-repository.port';
import type { Session, CreateSessionData, SessionKind } from '../../domain/models/session';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

/**
 * Implementación del puerto `SessionRepositoryPort` usando Prisma.
 *
 * Captura excepciones técnicas de Prisma en su límite, las registra
 * sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 * La aplicación nunca captura excepciones técnicas: solo recibe el rail `Result`.
 *
 * Acepta tanto `PrismaService` (DI normal) como `Prisma.TransactionClient`
 * (para participar en la transacción de `ActivateAdminUnitOfWorkPort` y
 * `ChangePasswordUnitOfWorkPort`).
 */
@Injectable()
export class PrismaSessionRepositoryAdapter implements SessionRepositoryPort {
  private readonly logger = new Logger(PrismaSessionRepositoryAdapter.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: Prisma.TransactionClient | PrismaService,
  ) {}

  async findByUserId(userId: string): Promise<Result<Session[], DomainError>> {
    try {
      const rows = await this.prisma.session.findMany({
        where: { userId },
      });
      return ok(rows.map((row) => this.toDomain(row)));
    } catch (error) {
      this.logger.warn(`findByUserId failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async create(data: CreateSessionData): Promise<Result<Session, DomainError>> {
    try {
      const row = await this.prisma.session.create({
        data: {
          userId: data.userId,
          sessionKind:
            data.sessionKind === 'AUTHENTICATED' ? 'AUTHENTICATED' : 'GUEST',
          refreshTokenHash: data.refreshTokenHash,
          expiresAt: data.expiresAt,
        } as Prisma.SessionUncheckedCreateInput,
      });
      return ok(this.toDomain(row));
    } catch (error) {
      this.logger.warn(`create failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async findById(id: string): Promise<Result<Session | null, DomainError>> {
    try {
      const row = await this.prisma.session.findUnique({ where: { id } });
      return ok(row ? this.toDomain(row) : null);
    } catch (error) {
      this.logger.warn(`findById failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async findByRefreshTokenHash(hash: string): Promise<Result<Session | null, DomainError>> {
    try {
      const row = await this.prisma.session.findUnique({
        where: { refreshTokenHash: hash },
      });
      return ok(row ? this.toDomain(row) : null);
    } catch (error) {
      this.logger.warn(`findByRefreshTokenHash failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async findActiveByUserId(userId: string, now: Date): Promise<Result<Session | null, DomainError>> {
    try {
      const row = await this.prisma.session.findFirst({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastActivityAt: 'desc' },
      });
      return ok(row ? this.toDomain(row) : null);
    } catch (error) {
      this.logger.warn(`findActiveByUserId failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async findActiveByUserIdExcluding(
    userId: string,
    excludeSessionId: string,
  ): Promise<Result<Session[], DomainError>> {
    try {
      const rows = await this.prisma.session.findMany({
        where: { userId, revokedAt: null, id: { not: excludeSessionId } },
        orderBy: { createdAt: 'asc' },
      });
      return ok(rows.map((row) => this.toDomain(row)));
    } catch (error) {
      this.logger.warn(`findActiveByUserIdExcluding failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
    newExpiresAt: Date,
  ): Promise<Result<Session, DomainError>> {
    try {
      const row = await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: newExpiresAt,
          lastActivityAt: new Date(),
        },
      });
      return ok(this.toDomain(row));
    } catch (error) {
      this.logger.warn(`rotateRefreshToken failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async touchActivity(sessionId: string, now: Date): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { lastActivityAt: now },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`touchActivity failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async revoke(sessionId: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`revoke failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async revokeAllForUser(userId: string): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`revokeAllForUser failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async revokeAllForUserExcept(
    userId: string,
    exceptSessionId: string,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: exceptSessionId } },
        data: { revokedAt: new Date() },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.warn(`revokeAllForUserExcept failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  /** Mapea fila Prisma a entidad de dominio. */
  private toDomain(row: {
    id: string;
    userId: string | null;
    sessionKind: SessionKind | string;
    refreshTokenHash: string;
    expiresAt: Date;
    lastActivityAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }): Session {
    const kind: SessionKind =
      String(row.sessionKind) === 'AUTHENTICATED' ? 'AUTHENTICATED' : 'GUEST';
    return {
      id: row.id,
      userId: row.userId ?? null,
      sessionKind: kind,
      refreshTokenHash: row.refreshTokenHash,
      expiresAt: row.expiresAt,
      lastActivityAt: row.lastActivityAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }
}
