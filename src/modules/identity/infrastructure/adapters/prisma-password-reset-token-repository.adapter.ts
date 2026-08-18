import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { PasswordResetTokenRepositoryPort } from '../../domain/ports/password-reset-token-repository.port';
import type { PasswordResetTokenRecord } from '../../domain/ports/password-reset-token-repository.port';

/**
 * Implementación del puerto `PasswordResetTokenRepositoryPort` usando Prisma.
 *
 * Acepta tanto `PrismaService` (DI normal) como `Prisma.TransactionClient`
 * (para participar en la transacción de `ResetPasswordUnitOfWorkPort`).
 */
@Injectable()
export class PrismaPasswordResetTokenRepositoryAdapter
  implements PasswordResetTokenRepositoryPort
{
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Prisma.TransactionClient | PrismaService,
  ) {}

  async invalidateAllActiveForUser(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });
  }

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    };
  }

  async markAsUsed(tokenId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: {
        id: tokenId,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });
    return result.count === 1;
  }
}
