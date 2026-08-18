/* eslint-disable no-console */
/**
 * Prueba de integración real de la purga de idempotency_records (MSF-ID-002)
 * contra PostgreSQL. Demuestra: cutoff 24h/30d, scopes pendientes/desconocidos,
 * batch 500, dos jobs concurrentes (advisory lock + FOR UPDATE SKIP LOCKED),
 * rollback total y métricas reales sin PII.
 * Uso: npx ts-node scripts/integration-purge-msf-id-002.ts
 */
import { PrismaService } from '../src/modules/identity/infrastructure/prisma.service';
import { PrismaIdempotencyPurgeRepositoryAdapter } from '../src/modules/identity/infrastructure/adapters/prisma-idempotency-purge-repository.adapter';
import { AdminProvisionScopeEvaluatorAdapter } from '../src/modules/identity/infrastructure/adapters/admin-provision-scope-evaluator.adapter';
import { InMemoryPurgeMetricsAdapter } from '../src/modules/identity/infrastructure/adapters/in-memory-purge-metrics.adapter';
import { ConsolePurgeLoggerAdapter } from '../src/modules/identity/infrastructure/adapters/console-purge-logger.adapter';
import { SystemClockAdapter } from '../src/modules/identity/infrastructure/adapters/system-clock.adapter';
import { PurgeIdempotencyRecordsUseCase } from '../src/modules/identity/application/use-cases/purge-idempotency-records.use-case';

const prisma = new PrismaService();
const DAY = 24 * 60 * 60 * 1000;

async function insertRecord(
  scope: string,
  ageMs: number,
  activationExpiresAt?: Date,
): Promise<string> {
  const row = await prisma.idempotencyRecord.create({
    data: {
      scope,
      idempotencyKey: crypto.randomUUID(),
      bodyHash: 'a'.repeat(64),
      responseJson: {
        resource_id: crypto.randomUUID(),
        status: 201,
        activation_expires_at: activationExpiresAt
          ? activationExpiresAt.toISOString()
          : new Date(Date.now() + 2 * DAY).toISOString(),
        body_hash: 'a'.repeat(64),
      },
      createdAt: new Date(Date.now() - ageMs),
    },
  });
  return row.id;
}

async function main(): Promise<void> {
  const suffix = Date.now();
  const ids: string[] = [];

  // ===== 1. Cutoff 24h/30d + scope pendiente/desconocido + clasificación exclusiva =====
  // Solo `admin-provision:<UUID válido>` es terminal; actor no-UUID o scope
  // desconocido se tratan como `operation_pending` y no se purgan.
  const adminScope = `admin-provision:${crypto.randomUUID()}`;
  const records = [
    { scope: adminScope, ageMs: 12 * 60 * 60 * 1000 }, // 12h → minimum_age_not_elapsed
    { scope: adminScope, ageMs: 29 * DAY }, // 29d con expiración futura → replay_active
    { scope: adminScope, ageMs: 29 * DAY, activationExpiresAt: new Date(Date.now() - 2 * DAY) }, // 29d con expiración vencida → retention_not_elapsed
    { scope: adminScope, ageMs: 31 * DAY }, // 31d → eligible (se purga)
    { scope: `admin-provision:actor-${suffix}`, ageMs: 31 * DAY }, // 31d pero actor no-UUID → pendiente
    { scope: `unknown-scope:${suffix}`, ageMs: 31 * DAY }, // 31d pero scope desconocido → pendiente
  ];
  for (const r of records) {
    ids.push(await insertRecord(r.scope, r.ageMs, r.activationExpiresAt));
  }

  const repo = new PrismaIdempotencyPurgeRepositoryAdapter(prisma);
  const metrics = new InMemoryPurgeMetricsAdapter();
  const uc = new PurgeIdempotencyRecordsUseCase(
    repo,
    new AdminProvisionScopeEvaluatorAdapter(),
    metrics,
    new ConsolePurgeLoggerAdapter(),
    new SystemClockAdapter(),
  );

  await uc.execute();

  const remaining = await prisma.idempotencyRecord.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: 'asc' },
  });
  const remainingScopes = remaining.map((r) => r.scope);
  const remainingAges = remaining.map((r) => Date.now() - r.createdAt.getTime());

  // Deben quedar 5: 12h, 29d (replay_active), 29d con expiración vencida
  // (retention_not_elapsed), admin-provision no-UUID (31d, operation_pending)
  // y unknown-scope (31d, operation_pending).
  if (remaining.length !== 5) {
    throw new Error(`[1] esperaba 5 restantes, hay ${remaining.length}`);
  }
  // El admin-provision con UUID válido de 31d debió purgarse (terminal).
  const adminUuidRemaining = remaining.filter(
    (r) => r.scope === adminScope && Date.now() - r.createdAt.getTime() >= 30 * DAY,
  );
  if (adminUuidRemaining.length !== 0) {
    throw new Error('[1] el registro de 31d admin-provision (UUID válido) debió purgarse');
  }
  // El admin-provision con actor no-UUID de 31d NO debió purgarse (mal formado).
  if (!remainingScopes.includes(`admin-provision:actor-${suffix}`)) {
    throw new Error('[1] el scope admin-provision con actor no-UUID no debió purgarse (operation_pending)');
  }
  if (!remainingScopes.includes(`unknown-scope:${suffix}`)) {
    throw new Error('[1] el scope desconocido no debió purgarse (operation_pending)');
  }
  if (!remainingAges.some((a) => a < DAY)) {
    throw new Error('[1] el registro de 12h no debió purgarse');
  }
  if (!remainingAges.some((a) => a >= 28 * DAY && a < 30 * DAY)) {
    throw new Error('[1] el registro de 29d no debió purgarse');
  }
  console.log('1. cutoff 24h/30d + scope pendiente/desconocido + clasificación exclusiva: OK');

  // ===== 2. Métricas reales sin PII =====
  const snap = metrics.snapshot();
  if (snap.deleted < 1) {
    throw new Error('[2] métricas: deleted debe ser >= 1');
  }
  if (snap.skipped.operation_pending < 2) {
    throw new Error('[2] métricas: skipped.operation_pending debe ser >= 2');
  }
  if (snap.skipped.replay_active < 1) {
    throw new Error('[2] métricas: skipped.replay_active debe ser >= 1 (29d)');
  }
  if (snap.skipped.retention_not_elapsed < 1) {
    throw new Error('[2] métricas: skipped.retention_not_elapsed debe ser >= 1 (29d con expiración vencida)');
  }
  if (snap.runs.success < 1) {
    throw new Error('[2] métricas: runs.success debe ser >= 1');
  }
  if (snap.lastSuccess === null) {
    throw new Error('[2] métricas: last_success no debe ser null');
  }
  console.log('2. métricas reales sin PII: OK', JSON.stringify(snap));

  // Limpieza del bloque 1.
  await prisma.idempotencyRecord.deleteMany({ where: { id: { in: ids } } });

  // ===== 3. Batch 500: insertar 600 purgables y verificar purga completa =====
  const batchIds: string[] = [];
  for (let i = 0; i < 600; i++) {
    batchIds.push(
      await insertRecord(`admin-provision:${crypto.randomUUID()}`, 31 * DAY),
    );
  }
  const metrics2 = new InMemoryPurgeMetricsAdapter();
  const uc2 = new PurgeIdempotencyRecordsUseCase(
    repo,
    new AdminProvisionScopeEvaluatorAdapter(),
    metrics2,
    new ConsolePurgeLoggerAdapter(),
    new SystemClockAdapter(),
  );
  await uc2.execute();
  const remainingBulk = await prisma.idempotencyRecord.count({
    where: { id: { in: batchIds } },
  });
  if (remainingBulk !== 0) {
    throw new Error(`[3] batch 500: quedaron ${remainingBulk} de 600`);
  }
  if (metrics2.snapshot().deleted !== 600) {
    throw new Error(`[3] batch 500: deleted=${metrics2.snapshot().deleted}, esperaba 600`);
  }
  console.log('3. batch 500 (600 filas purgadas en batches): OK');

  // ===== 4. Dos jobs concurrentes: advisory lock + FOR UPDATE SKIP LOCKED =====
  const concIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    concIds.push(
      await insertRecord(`admin-provision:${crypto.randomUUID()}`, 31 * DAY),
    );
  }
  const m1 = new InMemoryPurgeMetricsAdapter();
  const m2 = new InMemoryPurgeMetricsAdapter();
  const ucA = new PurgeIdempotencyRecordsUseCase(
    repo,
    new AdminProvisionScopeEvaluatorAdapter(),
    m1,
    new ConsolePurgeLoggerAdapter(),
    new SystemClockAdapter(),
  );
  const ucB = new PurgeIdempotencyRecordsUseCase(
    repo,
    new AdminProvisionScopeEvaluatorAdapter(),
    m2,
    new ConsolePurgeLoggerAdapter(),
    new SystemClockAdapter(),
  );
  await Promise.all([ucA.execute(), ucB.execute()]);
  const remainingConc = await prisma.idempotencyRecord.count({
    where: { id: { in: concIds } },
  });
  const totalDeleted = m1.snapshot().deleted + m2.snapshot().deleted;
  if (remainingConc !== 0) {
    throw new Error(`[4] concurrencia: quedaron ${remainingConc} de 40`);
  }
  if (totalDeleted !== 40) {
    throw new Error(
      `[4] concurrencia: total deleted=${totalDeleted}, esperaba 40 (sin doble procesamiento)`,
    );
  }
  console.log('4. dos jobs concurrentes (advisory lock + SKIP LOCKED): OK');

  // ===== 5. Rollback total: evaluación que lanza no borra nada =====
  const rbId = await insertRecord(
    `admin-provision:${crypto.randomUUID()}`,
    31 * DAY,
  );
  await expectRollback(repo, rbId);
  console.log('5. rollback total ante fallo de evaluación: OK');

  console.log('\nPURGA MSF-ID-002: TODAS LAS COMPROBACIONES OK');
}

/** Verifica que un fallo dentro de la transacción no deja efectos (rollback). */
async function expectRollback(
  repo: PrismaIdempotencyPurgeRepositoryAdapter,
  id: string,
): Promise<void> {
  // ROP (Master Spec §ROP / ADR-017): el adapter traduce la excepción a
  // `Fail<TECHNICAL_DEPENDENCY_FAILURE>` en su límite; NO propaga la excepción
  // al caso de uso. Verificamos que el Result sea Failure sin metadata/PII.
  const result = await repo.purgeBatch(
    new Date(),
    new Date(Date.now() - DAY),
    500,
    async () => {
      throw new Error('forced evaluation failure');
    },
  );
  if (result.ok) {
    throw new Error(
      '[5] se esperaba que purgeBatch devolviera Failure (no lanzó)',
    );
  }
  if (result.error.code !== 'TECHNICAL_DEPENDENCY_FAILURE') {
    throw new Error(
      `[5] se esperaba TECHNICAL_DEPENDENCY_FAILURE, obtuvo ${result.error.code}`,
    );
  }
  if (result.error.metadata !== undefined) {
    throw new Error('[5] Failure no debe transportar metadata (causa/PII)');
  }
  const serialized = JSON.stringify(result.error);
  if (serialized.includes('forced evaluation failure')) {
    throw new Error('[5] Failure no debe filtrar la causa técnica');
  }
  const stillThere = await prisma.idempotencyRecord.count({ where: { id } });
  if (stillThere !== 1) {
    throw new Error('[5] rollback: el registro no debió borrarse');
  }
  await prisma.idempotencyRecord.delete({ where: { id } });
}

main()
  .catch((e) => {
    console.error('PURGA FALLÓ:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
