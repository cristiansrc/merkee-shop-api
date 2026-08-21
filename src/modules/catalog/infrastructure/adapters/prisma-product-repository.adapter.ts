import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import {
  ProductRepositoryPort,
  ProductRecord,
  ProductImageRecord,
  ProductWithImages,
  ProductPage,
} from '../../domain/ports/product-repository.port';

@Injectable()
export class PrismaProductRepositoryAdapter implements ProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(productId: string): Promise<ProductWithImages | null> {
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    if (!row) return null;
    return {
      product: this.toProductRecord(row),
      images: row.images.map(this.toImageRecord),
    };
  }

  async listActive(page: number, size: number): Promise<ProductPage> {
    const where = { deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: 'asc' } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((r: typeof rows[number]) => ({
        product: this.toProductRecord(r),
        images: r.images.map(this.toImageRecord),
      })),
      page,
      size,
      total,
    };
  }

  async listActiveByCategory(
    categoryId: string,
    page: number,
    size: number,
  ): Promise<ProductPage> {
    const where = { deletedAt: null, categoryId };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: 'asc' } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((r: typeof rows[number]) => ({
        product: this.toProductRecord(r),
        images: r.images.map(this.toImageRecord),
      })),
      page,
      size,
      total,
    };
  }

  async searchActive(
    query: string,
    page: number,
    size: number,
  ): Promise<ProductPage> {
    const where = {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: 'asc' } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((r: typeof rows[number]) => ({
        product: this.toProductRecord(r),
        images: r.images.map(this.toImageRecord),
      })),
      page,
      size,
      total,
    };
  }

  async listAll(page: number, size: number): Promise<ProductPage> {
    const where = { deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: 'asc' } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((r: typeof rows[number]) => ({
        product: this.toProductRecord(r),
        images: r.images.map(this.toImageRecord),
      })),
      page,
      size,
      total,
    };
  }

  async create(data: {
    readonly categoryId: string;
    readonly name: string;
    readonly description: string;
    readonly regularPriceCop: bigint;
    readonly salePriceCop: bigint;
    readonly unit: string;
    readonly stockOnHand: number;
    readonly images: readonly {
      readonly key: string;
      readonly altText: string;
      readonly position: number;
    }[];
  }): Promise<ProductWithImages> {
    const row = await this.prisma.product.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        regularPriceCop: data.regularPriceCop,
        salePriceCop: data.salePriceCop,
        unit: data.unit,
        stockOnHand: data.stockOnHand,
        images: {
          create: data.images.map((img) => ({
            key: img.key,
            altText: img.altText,
            position: img.position,
          })),
        },
      },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    return {
      product: this.toProductRecord(row),
      images: row.images.map(this.toImageRecord),
    };
  }

  async update(
    productId: string,
    expectedVersion: number,
    data: {
      readonly categoryId: string;
      readonly name: string;
      readonly description: string;
      readonly regularPriceCop: bigint;
      readonly salePriceCop: bigint;
      readonly unit: string;
      readonly images: readonly {
        readonly key: string;
        readonly altText: string;
        readonly position: number;
      }[];
    },
  ): Promise<ProductWithImages | null> {
    try {
      // Delete existing images and recreate
      await this.prisma.productImage.deleteMany({
        where: { productId },
      });

      const row = await this.prisma.product.update({
        where: { id: productId, version: expectedVersion },
        data: {
          categoryId: data.categoryId,
          name: data.name,
          description: data.description,
          regularPriceCop: data.regularPriceCop,
          salePriceCop: data.salePriceCop,
          unit: data.unit,
          version: { increment: 1 },
          images: {
            create: data.images.map((img) => ({
              key: img.key,
              altText: img.altText,
              position: img.position,
            })),
          },
        },
        include: { images: { orderBy: { position: 'asc' } } },
      });
      return {
        product: this.toProductRecord(row),
        images: row.images.map(this.toImageRecord),
      };
    } catch {
      return null;
    }
  }

  async softDelete(productId: string): Promise<boolean> {
    try {
      await this.prisma.product.update({
        where: { id: productId },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  private toProductRecord(row: {
    id: string;
    categoryId: string;
    name: string;
    description: string;
    regularPriceCop: bigint;
    salePriceCop: bigint;
    unit: string;
    stockOnHand: number;
    stockReserved: number;
    version: number;
    deletedAt: Date | null;
  }): ProductRecord {
    return {
      id: row.id,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      regularPriceCop: row.regularPriceCop,
      salePriceCop: row.salePriceCop,
      unit: row.unit,
      stockOnHand: row.stockOnHand,
      stockReserved: row.stockReserved,
      version: row.version,
      deletedAt: row.deletedAt,
    };
  }

  private toImageRecord(row: {
    id: string;
    productId: string;
    key: string;
    altText: string;
    position: number;
  }): ProductImageRecord {
    return {
      id: row.id,
      productId: row.productId,
      key: row.key,
      altText: row.altText,
      position: row.position,
    };
  }
}
