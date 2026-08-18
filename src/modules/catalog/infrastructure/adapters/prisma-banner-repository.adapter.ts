import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import {
  BannerRepositoryPort,
  BannerRecord,
} from '../../domain/ports/banner-repository.port';

@Injectable()
export class PrismaBannerRepositoryAdapter implements BannerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<readonly BannerRecord[]> {
    const rows = await this.prisma.banner.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { displayOrder: 'asc' },
    });
    return rows.map(this.toRecord);
  }

  async listAll(): Promise<readonly BannerRecord[]> {
    const rows = await this.prisma.banner.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    return rows.map(this.toRecord);
  }

  async findById(bannerId: string): Promise<BannerRecord | null> {
    const row = await this.prisma.banner.findUnique({
      where: { id: bannerId },
    });
    return row ? this.toRecord(row) : null;
  }

  async create(data: {
    readonly name: string;
    readonly imageKey: string;
    readonly targetPath: string | null;
    readonly displayOrder: number;
    readonly active: boolean;
  }): Promise<BannerRecord> {
    const row = await this.prisma.banner.create({
      data: {
        name: data.name,
        imageKey: data.imageKey,
        targetPath: data.targetPath,
        displayOrder: data.displayOrder,
        active: data.active,
      },
    });
    return this.toRecord(row);
  }

  async update(
    bannerId: string,
    expectedVersion: number,
    data: {
      readonly name: string;
      readonly imageKey: string;
      readonly targetPath: string | null;
      readonly displayOrder: number;
      readonly active: boolean;
    },
  ): Promise<BannerRecord | null> {
    try {
      const row = await this.prisma.banner.update({
        where: { id: bannerId, version: expectedVersion },
        data: {
          name: data.name,
          imageKey: data.imageKey,
          targetPath: data.targetPath,
          displayOrder: data.displayOrder,
          active: data.active,
          version: { increment: 1 },
        },
      });
      return this.toRecord(row);
    } catch {
      return null;
    }
  }

  async softDelete(bannerId: string): Promise<boolean> {
    try {
      await this.prisma.banner.update({
        where: { id: bannerId },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  private toRecord(row: {
    id: string;
    name: string;
    imageKey: string;
    targetPath: string | null;
    displayOrder: number;
    active: boolean;
    version: number;
    deletedAt: Date | null;
  }): BannerRecord {
    return {
      id: row.id,
      name: row.name,
      imageKey: row.imageKey,
      targetPath: row.targetPath,
      displayOrder: row.displayOrder,
      active: row.active,
      version: row.version,
      deletedAt: row.deletedAt,
    };
  }
}
