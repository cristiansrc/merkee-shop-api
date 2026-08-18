import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IdempotencyPort,
  IdempotencyRecord,
} from '../../domain/ports/idempotency.port';
import { PrismaService } from '../prisma.service';

/**
 * Adapter de salida de idempotencia (Prisma).
 *
 * Persiste registros de idempotencia únicos por `(scope, idempotency_key)`.
 * `save` lanza si la clave ya existe (violación de unicidad) para que el caso
 * de uso detecte reproducción concurrente. `findForUpdate` bloquea la fila con
 * `FOR UPDATE` dentro de la transacción de provisión (ADR-018). No almacena
 * secretos ni PII.
 *
 * Acepta `PrismaService` o un `Prisma.TransactionClient` para participar en la
 * transacción única de provisión de admin.
 */
@Injectable()
export class PrismaIdempotencyAdapter implements IdempotencyPort {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Prisma.TransactionClient | PrismaService,
  ) {}

  async find(scope: string, key: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
    });
    return row ? this.toDomain(row) : null;
  }

  async findForUpdate(
    scope: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        scope: string;
        idempotency_key: string;
        body_hash: string;
        response_json: Prisma.JsonValue;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT id, scope, idempotency_key, body_hash, response_json, created_at, updated_at
      FROM idempotency_records
      WHERE scope = ${scope} AND idempotency_key = ${key}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      scope: row.scope,
      key: row.idempotency_key,
      bodyHash: row.body_hash,
      responseJson: row.response_json,
    };
  }

  async save(
    scope: string,
    key: string,
    bodyHash: string,
    responseJson: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyRecord.create({
      data: {
        scope,
        idempotencyKey: key,
        bodyHash,
        responseJson: responseJson as Prisma.InputJsonValue,
      },
    });
  }

  /** Convierte la fila Prisma a la entidad de dominio. */
  private toDomain(row: {
    scope: string;
    idempotencyKey: string;
    bodyHash: string;
    responseJson: Prisma.JsonValue;
  }): IdempotencyRecord {
    return {
      scope: row.scope,
      key: row.idempotencyKey,
      bodyHash: row.bodyHash,
      responseJson: row.responseJson,
    };
  }
}
