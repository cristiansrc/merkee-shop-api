import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import {
  CategoryRepositoryPort,
  CategoryRecord,
} from '../../domain/ports/category-repository.port';

@Injectable()
export class PrismaCategoryRepositoryAdapter implements CategoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<readonly CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toRecord);
  }

  async listActive(): Promise<readonly CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toRecord);
  }

  async findById(categoryId: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    return row ? this.toRecord(row) : null;
  }

  async findActiveById(categoryId: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    return row ? this.toRecord(row) : null;
  }

  async create(data: {
    readonly name: string;
    readonly imageKey: string;
  }): Promise<CategoryRecord> {
    const row = await this.prisma.category.create({
      data: {
        name: data.name,
        imageKey: data.imageKey,
      },
    });
    return this.toRecord(row);
  }

  async update(
    categoryId: string,
    expectedVersion: number,
    data: { readonly name: string; readonly imageKey: string },
  ): Promise<CategoryRecord | null> {
    try {
      const row = await this.prisma.category.update({
        where: { id: categoryId, version: expectedVersion },
        data: {
          name: data.name,
          imageKey: data.imageKey,
          version: { increment: 1 },
        },
      });
      return this.toRecord(row);
    } catch {
      return null;
    }
  }

  async softDelete(categoryId: string): Promise<boolean> {
    try {
      await this.prisma.category.update({
        where: { id: categoryId },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  async countActiveProducts(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId, deletedAt: null },
    });
  }

  private toRecord(row: {
    id: string;
    name: string;
    imageKey: string;
    version: number;
    deletedAt: Date | null;
  }): CategoryRecord {
    return {
      id: row.id,
      name: row.name,
      imageKey: row.imageKey,
      version: row.version,
      deletedAt: row.deletedAt,
    };
  }
}
