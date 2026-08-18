import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CatalogIdempotencyPort,
  IdempotencyRecord,
} from '../../domain/ports/catalog-idempotency.port';

@Injectable()
export class PrismaCatalogIdempotencyAdapter implements CatalogIdempotencyPort {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_idempotencyKey: { scope, idempotencyKey },
      },
    });
    if (!row) return null;
    return {
      scope: row.scope,
      idempotencyKey: row.idempotencyKey,
      bodyHash: row.bodyHash,
      responseJson: row.responseJson,
    };
  }

  async findForUpdate(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        scope: string;
        idempotency_key: string;
        body_hash: string;
        response_json: unknown;
      }>
    >`
      SELECT scope, idempotency_key, body_hash, response_json
      FROM idempotency_records
      WHERE scope = ${scope} AND idempotency_key = ${idempotencyKey}
      FOR UPDATE
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      scope: row.scope,
      idempotencyKey: row.idempotency_key,
      bodyHash: row.body_hash,
      responseJson: row.response_json,
    };
  }

  async save(record: {
    readonly scope: string;
    readonly idempotencyKey: string;
    readonly bodyHash: string;
    readonly responseJson: unknown;
  }): Promise<void> {
    await this.prisma.idempotencyRecord.create({
      data: {
        scope: record.scope,
        idempotencyKey: record.idempotencyKey,
        bodyHash: record.bodyHash,
        responseJson: record.responseJson as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
