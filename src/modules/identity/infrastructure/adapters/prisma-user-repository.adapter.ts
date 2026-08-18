import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { UserRepositoryPort, ProfileUpdateData } from '../../domain/ports/user-repository.port';
import type { User, CreateUserData, CreateAdminUserData } from '../../domain/models/user';
import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { technicalFailure } from '../../domain/identity-errors';

/**
 * Implementación del puerto `UserRepositoryPort` usando Prisma.
 *
 * Captura excepciones técnicas de Prisma en su límite, las registra
 * sin PII y las traduce a `TECHNICAL_DEPENDENCY_FAILURE` (Master Spec §ROP).
 * La aplicación nunca captura excepciones técnicas: solo recibe el rail `Result`.
 *
 * Acepta tanto `PrismaService` (DI normal) como `Prisma.TransactionClient`
 * para participar en las transacciones de `ProvisionUnitOfWorkPort`,
 * `ActivateAdminUnitOfWorkPort` y `ChangePasswordUnitOfWorkPort` (MSF-ID-002 / MSF-ID-003).
 */
@Injectable()
export class PrismaUserRepositoryAdapter implements UserRepositoryPort {
  private readonly logger = new Logger(PrismaUserRepositoryAdapter.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: Prisma.TransactionClient | PrismaService,
  ) {}

  async findByEmail(email: string): Promise<Result<User | null, DomainError>> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) return ok(null);
      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`findByEmail failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async findById(id: string): Promise<Result<User | null, DomainError>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) return ok(null);
      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`findById failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async create(data: CreateUserData): Promise<Result<User, DomainError>> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash: data.passwordHash,
          displayName: data.displayName.trim() || data.email.split('@')[0],
          phone: data.phone?.trim() || null,
          role: data.role,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`create failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async createAdmin(data: CreateAdminUserData): Promise<Result<User, DomainError>> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder', // placeholder no autenticable
          displayName: data.displayName.trim() || data.email.split('@')[0],
          phone: data.phone?.trim() || null,
          role: 'admin' as const,
          mustChangePassword: true,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`createAdmin failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async updatePassword(userId: string, passwordHash: string): Promise<Result<User, DomainError>> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`updatePassword failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  async updateProfile(userId: string, profileUpdate: ProfileUpdateData): Promise<Result<User, DomainError>> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          displayName: profileUpdate.displayName?.trim(),
          phone: profileUpdate.phone?.trim() || null,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          phone: true,
          role: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return ok(this.mapToUser(user));
    } catch (error) {
      this.logger.warn(`updateProfile failed (code=${(error as { code?: string }).code ?? 'unknown'})`);
      return fail(technicalFailure());
    }
  }

  private mapToUser(prismaUser: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    phone: string | null;
    role: string;
    mustChangePassword: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: prismaUser.id.toString(),
      email: prismaUser.email,
      passwordHash: prismaUser.passwordHash,
      displayName: prismaUser.displayName,
      phone: prismaUser.phone || null,
      role: prismaUser.role as 'admin' | 'cliente',
      mustChangePassword: Boolean(prismaUser.mustChangePassword),
      createdAt: new Date(prismaUser.createdAt),
      updatedAt: new Date(prismaUser.updatedAt),
    };
  }
}
