import { PrismaIdempotencyPurgeRepositoryAdapter } from './prisma-idempotency-purge-repository.adapter';
import {
  Result,
  isFailure,
  isSuccess,
} from '../../../../shared/domain/result';
import {
  DomainError,
  DomainErrorCode,
} from '../../../../shared/domain/domain-error';
import { PurgeBatchResult } from '../../domain/ports/idempotency-purge-repository.port';

const now = new Date('2026-08-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const minimumAgeCutoff = new Date(now.getTime() - DAY);

function emptySkipped() {
  return {
    retention_not_elapsed: 0,
    minimum_age_not_elapsed: 0,
    replay_active: 0,
    operation_pending: 0,
  };
}

/** Extrae el SQL de un argumento de mock (string, tagged template o Prisma.Sql). */
function sqlOf(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (Array.isArray(arg)) return arg.join('');
  const obj = arg as { strings?: string[]; values?: unknown[] };
  if (obj && Array.isArray(obj.strings)) return obj.strings.join('');
  return String(arg);
}

/**
 * Helper de legibilidad: los tests asumen `Success` y operan sobre `.value`.
 * Si el adapter devuelve `Failure`, el test falla con un mensaje claro.
 */
function unwrap(result: Result<PurgeBatchResult, DomainError>): PurgeBatchResult {
  if (isSuccess(result)) {
    return result.value;
  }
  throw new Error(
    `Adapter returned Failure: ${JSON.stringify(result.error)}`,
  );
}

/** Construye un mock de transacción Prisma con los métodos usados por purgeBatch. */
function mockTx(overrides?: {
  rows?: Array<{
    id: string;
    scope: string;
    created_at: Date;
    activation_expires_at: string | null;
  }>;
  deleteCount?: number;
}) {
  const rows = overrides?.rows ?? [];
  const deleteCount = overrides?.deleteCount ?? 0;
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue(rows),
    idempotencyRecord: {
      deleteMany: jest.fn().mockResolvedValue({ count: deleteCount }),
    },
  };
}

function mockPrisma(tx: ReturnType<typeof mockTx>) {
  return {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
}

function mockFailingPrisma(error: unknown) {
  return {
    $transaction: jest.fn().mockRejectedValue(error),
  };
}

describe('PrismaIdempotencyPurgeRepositoryAdapter', () => {
  it('ejecuta el batch en una única transacción READ COMMITTED con advisory lock, timeout, FOR UPDATE SKIP LOCKED y delete', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date('2026-07-01T00:00:00.000Z'), activation_expires_at: null },
        { id: 'r2', scope: 'admin-provision:actor-2', created_at: new Date('2026-06-01T00:00:00.000Z'), activation_expires_at: null },
      ],
      deleteCount: 2,
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockResolvedValue('eligible');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    expect(isSuccess(result)).toBe(true);
    expect(unwrap(result)).toEqual({ deleted: 2, hasMore: false, skipped: emptySkipped() });
    // Una sola transacción.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Timeout de 5 s (lock y statements) + advisory lock transaccional global.
    const rawSql = tx.$executeRaw.mock.calls.map((c) => sqlOf(c[0])).join('\n');
    expect(rawSql).toContain('lock_timeout');
    expect(rawSql).toContain('statement_timeout');
    expect(rawSql).toContain('pg_advisory_xact_lock');
    // Selección con FOR UPDATE SKIP LOCKED dentro de la transacción.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // Evaluación de cada candidato dentro de la transacción.
    expect(evaluate).toHaveBeenCalledTimes(2);
    // Delete dentro de la misma transacción.
    expect(tx.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r2'] } },
    });
  });

  it('selecciona candidatos desde now (sin filtrar antes) para alcanzar las cinco clasificaciones', async () => {
    const tx = mockTx({
      rows: [
        // 12 horas: <24 h → minimum_age_not_elapsed (alcanzable en la transacción).
        { id: 'r0', scope: 'admin-provision:actor-0', created_at: new Date(now.getTime() - 0.5 * DAY), activation_expires_at: null },
        // 29 días con expiración específica vencida → retention_not_elapsed.
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date(now.getTime() - 29 * DAY), activation_expires_at: new Date(now.getTime() - 2 * DAY).toISOString() },
        // 29 días con expiración específica no vencida → replay_active.
        { id: 'r2', scope: 'admin-provision:actor-2', created_at: new Date(now.getTime() - 29 * DAY), activation_expires_at: new Date(now.getTime() + 2 * DAY).toISOString() },
        // 31 días: retención vencida → purgable (eligible).
        { id: 'r3', scope: 'admin-provision:actor-3', created_at: new Date(now.getTime() - 31 * DAY), activation_expires_at: null },
      ],
      deleteCount: 1,
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest
      .fn()
      .mockResolvedValueOnce('minimum_age_not_elapsed')
      .mockResolvedValueOnce('retention_not_elapsed')
      .mockResolvedValueOnce('replay_active')
      .mockResolvedValueOnce('eligible');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    // El WHERE parte de `now` (no filtra por 24 h ni por 30 d): las cinco
    // clasificaciones son alcanzables dentro de la transacción.
    const selectSql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(selectSql).toContain('created_at <');
    expect(selectSql).not.toContain('30 days');
    // La selección trae la expiración específica del snapshot para distinguir
    // replay_active de retention_not_elapsed.
    expect(selectSql).toContain("response_json->>'activation_expires_at'");
    // Los cuatro candidatos se evalúan en la transacción.
    expect(evaluate).toHaveBeenCalledTimes(4);
    // Solo el de >30 d se elimina; los demás se saltan por su razón.
    const batch = unwrap(result);
    expect(batch.deleted).toBe(1);
    expect(batch.skipped.minimum_age_not_elapsed).toBe(1);
    expect(batch.skipped.retention_not_elapsed).toBe(1);
    expect(batch.skipped.replay_active).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r3'] } },
    });
  });

  it('no purga un registro de 24 h (minimum_age_not_elapsed)', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date(now.getTime() - DAY), activation_expires_at: null },
      ],
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockResolvedValue('minimum_age_not_elapsed');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    const batch = unwrap(result);
    expect(batch.deleted).toBe(0);
    expect(batch.skipped.minimum_age_not_elapsed).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('no purga un registro de 29 d (replay_active)', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date(now.getTime() - 29 * DAY), activation_expires_at: null },
      ],
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockResolvedValue('replay_active');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    const batch = unwrap(result);
    expect(batch.deleted).toBe(0);
    expect(batch.skipped.replay_active).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('no purga un registro de 29 d con expiración específica vencida (retention_not_elapsed)', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date(now.getTime() - 29 * DAY), activation_expires_at: new Date(now.getTime() - 2 * DAY).toISOString() },
      ],
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockResolvedValue('retention_not_elapsed');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    const batch = unwrap(result);
    expect(batch.deleted).toBe(0);
    expect(batch.skipped.retention_not_elapsed).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('purga un registro de >30 d elegible', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:actor-1', created_at: new Date(now.getTime() - 31 * DAY), activation_expires_at: null },
      ],
      deleteCount: 1,
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockResolvedValue('eligible');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    const batch = unwrap(result);
    expect(batch.deleted).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
    });
  });

  it('acumula skips por razón y no borra si ningún candidato es elegible', async () => {
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'unknown:1', created_at: new Date('2026-06-01T00:00:00.000Z'), activation_expires_at: null },
        { id: 'r2', scope: 'unknown:2', created_at: new Date('2026-06-02T00:00:00.000Z'), activation_expires_at: null },
      ],
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest
      .fn()
      .mockResolvedValueOnce('operation_pending')
      .mockResolvedValueOnce('retention_not_elapsed');
    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    const batch = unwrap(result);
    expect(batch.deleted).toBe(0);
    expect(batch.skipped.operation_pending).toBe(1);
    expect(batch.skipped.retention_not_elapsed).toBe(1);
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('devuelve hasMore=true cuando el batch devuelve el máximo (500)', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `r${i}`,
      scope: 'admin-provision:a',
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      activation_expires_at: null,
    }));
    const tx = mockTx({ rows, deleteCount: 500 });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, async () => 'eligible');

    const batch = unwrap(result);
    expect(batch.deleted).toBe(500);
    expect(batch.hasMore).toBe(true);
    // El límite se pasa a la consulta SQL.
    const selectSql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(selectSql).toContain('LIMIT');
    expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('no borra nada si no hay candidatos (hasMore=false)', async () => {
    const tx = mockTx({ rows: [] });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, async () => 'eligible');

    expect(unwrap(result)).toEqual({ deleted: 0, hasMore: false, skipped: emptySkipped() });
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('traduce excepciones técnicas a Failure de TECHNICAL_DEPENDENCY_FAILURE (rollback total) ante fallo de evaluación', async () => {
    // ROP (Master Spec §ROP / ADR-017): la traducción de excepciones técnicas
    // a `DomainError` ocurre en el límite del adapter. No se propaga la
    // excepción al caso de uso; el rollback total lo garantiza Prisma.
    const tx = mockTx({
      rows: [
        { id: 'r1', scope: 'admin-provision:a', created_at: new Date('2026-06-01T00:00:00.000Z'), activation_expires_at: null },
      ],
    });
    const prisma = mockPrisma(tx);
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const evaluate = jest.fn().mockRejectedValue(new Error('evaluation failed'));

    const result = await adapter.purgeBatch(now, minimumAgeCutoff, 500, evaluate);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
      // No se filtra la causa ni PII.
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('evaluation failed');
    }
    // El delete no llega a ejecutarse: la transacción se revierte.
    expect(tx.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('traduce excepciones técnicas propagadas por $transaction a Failure (rollback total)', async () => {
    // Falla técnica simulado a nivel de la transacción: el adapter debe
    // traducirlo a `TECHNICAL_DEPENDENCY_FAILURE` (sin causa/PII) y NO
    // propagar la excepción.
    const prisma = mockFailingPrisma(
      Object.assign(new Error('db connection refused'), { code: 'P1001' }),
    );
    const adapter = new PrismaIdempotencyPurgeRepositoryAdapter(prisma as never);

    const result = await adapter.purgeBatch(
      now,
      minimumAgeCutoff,
      500,
      async () => 'eligible',
    );

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe(
        DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      );
      expect(result.error.metadata).toBeUndefined();
      expect(JSON.stringify(result.error)).not.toContain('db connection');
      expect(JSON.stringify(result.error)).not.toContain('P1001');
    }
  });
});
