import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminActivationTokenRepositoryPort } from '../../domain/ports/admin-activation-token-repository.port';
import {
  AdminActivationToken,
  CreateAdminActivationTokenData,
} from '../../domain/models/admin-activation-token';
import { PrismaService } from '../prisma.service';

/**
 * Adapter de salida de repositorio de tokens de activación de admin (Prisma).
 *
 * Traduce entre el modelo de dominio `AdminActivationToken` y el modelo Prisma.
 * El consumo atómico usa `updateMany` con `used_at IS NULL AND expires_at > now()`
 * (la vigencia se valida en la transacción de canje, no en el índice). Solo se
 * persiste el hash del token; nunca el token en claro.
 *
 * Acepta `PrismaService` o un `Prisma.TransactionClient` para participar en la
 * transacción única de provisión de admin.
 */
@Injectable()
export class PrismaAdminActivationTokenRepositoryAdapter
  implements AdminActivationTokenRepositoryPort
{
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Prisma.TransactionClient | PrismaService,
  ) {}

  async findByTokenHash(hash: string): Promise<AdminActivationToken | null> {
    const row = await this.prisma.adminActivationToken.findUnique({
      where: { tokenHash: hash },
    });
    return row ? this.toDomain(row) : null;
  }

  async findActiveByUserId(
    userId: string,
    now: Date,
  ): Promise<AdminActivationToken | null> {
    const row = await this.prisma.adminActivationToken.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async create(
    data: CreateAdminActivationTokenData,
  ): Promise<AdminActivationToken> {
    const row = await this.prisma.adminActivationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        createdByUserId: data.createdByUserId,
      },
    });
    return this.toDomain(row);
  }

  async revokeExpiredUnused(userId: string, now: Date): Promise<void> {
    await this.prisma.adminActivationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { lte: now } },
      data: { usedAt: now },
    });
  }

  async consumeUnused(tokenId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.adminActivationToken.updateMany({
      where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  /** Convierte la fila Prisma a la entidad de dominio. */
  private toDomain(row: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }): AdminActivationToken {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
