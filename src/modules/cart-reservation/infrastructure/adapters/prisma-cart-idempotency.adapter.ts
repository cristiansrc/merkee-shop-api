import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import {
  CartIdempotencyPort,
  IdempotencyRecord,
  SaveIdempotencyRecordParams,
} from '../../domain/ports/cart-idempotency.port';

/**
 * Adapter Prisma de idempotencia para el carrito (infrastructure).
 *
 * Reutiliza la tabla genérica `idempotency_records` con scopes
 * específicos para cada operación de carrito.
 */
@Injectable()
export class PrismaCartIdempotencyAdapter implements CartIdempotencyPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async find(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_idempotencyKey: { scope, idempotencyKey },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      scope: record.scope,
      idempotencyKey: record.idempotencyKey,
      bodyHash: record.bodyHash,
      responseJson: record.responseJson,
    };
  }

  async findForUpdate(
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const result = await this.prisma.$queryRaw<
      Array<{
        id: string;
        scope: string;
        idempotency_key: string;
        body_hash: string;
        response_json: unknown;
      }>
    >`
      SELECT id, scope, idempotency_key, body_hash, response_json
      FROM idempotency_records
      WHERE scope = ${scope}
      AND idempotency_key = ${idempotencyKey}::uuid
      FOR UPDATE
    `;

    if (!result || result.length === 0) return null;

    const r = result[0];
    return {
      id: r.id,
      scope: r.scope,
      idempotencyKey: r.idempotency_key,
      bodyHash: r.body_hash,
      responseJson: r.response_json,
    };
  }

  async save(params: SaveIdempotencyRecordParams): Promise<IdempotencyRecord> {
    const record = await this.prisma.idempotencyRecord.create({
      data: {
        scope: params.scope,
        idempotencyKey: params.idempotencyKey,
        bodyHash: params.bodyHash,
        responseJson: params.responseJson as any,
      },
    });

    return {
      id: record.id,
      scope: record.scope,
      idempotencyKey: record.idempotencyKey,
      bodyHash: record.bodyHash,
      responseJson: record.responseJson,
    };
  }
}
