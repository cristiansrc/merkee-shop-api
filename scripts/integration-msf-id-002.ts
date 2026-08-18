/* eslint-disable no-console */
/**
 * Prueba de integración real (MSF-ID-002) contra PostgreSQL.
 * Demuestra: frontera transaccional única, rollback total, replay igual/divergente
 * y concurrencia de dos provisiones con la misma clave.
 * Uso: npx ts-node scripts/integration-msf-id-002.ts
 */
import { PrismaService } from '../src/modules/identity/infrastructure/prisma.service';
import { PrismaProvisionUnitOfWorkAdapter } from '../src/modules/identity/infrastructure/adapters/prisma-provision-unit-of-work.adapter';
import { CookieTokenAdapter } from '../src/modules/identity/infrastructure/adapters/cookie-token.adapter';
import { SystemClockAdapter } from '../src/modules/identity/infrastructure/adapters/system-clock.adapter';
import { ProvisionAdminUserUseCase } from '../src/modules/identity/application/use-cases/provision-admin-user.use-case';
import { isSuccess, isFailure } from '../src/shared/domain/result';
import { DomainErrorCode } from '../src/shared/domain/domain-error';

const prisma = new PrismaService();

async function main(): Promise<void> {
  const uow = new PrismaProvisionUnitOfWorkAdapter(prisma);
  const cookie = new CookieTokenAdapter();
  const clock = new SystemClockAdapter();

  const uc = new ProvisionAdminUserUseCase(uow, cookie, clock);

  const suffix = Date.now();
  const actorEmail = `actor-${suffix}@example.com`;
  const targetEmail = `target-${suffix}@example.com`;
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  // Actor admin con contraseña cambiada.
  const actor = await prisma.user.create({
    data: {
      email: actorEmail,
      passwordHash: 'x',
      displayName: 'Actor',
      role: 'admin',
      mustChangePassword: false,
    },
  });

  const cmd = {
    actorId: actor.id,
    idempotencyKey: key,
    displayName: 'Nuevo Admin',
    email: targetEmail,
    phone: null,
  };

  // 1. Primera provisión → success.
  const r1 = await uc.execute(cmd);
  if (!isSuccess(r1)) {
    console.error('r1 failure:', JSON.stringify(r1.error));
    throw new Error('r1 should succeed');
  }
  console.log('1. provisión inicial: OK', r1.value.id);

  // 2. Replay con misma clave y cuerpo → misma respuesta, sin duplicar.
  const r2 = await uc.execute(cmd);
  if (!isSuccess(r2)) throw new Error('r2 should replay');
  if (r2.value.id !== r1.value.id) throw new Error('replay id mismatch');
  console.log('2. replay igual: OK (mismo id)');

  // 3. Misma clave, cuerpo divergente → 409 IDEMPOTENCY_KEY_REUSED.
  const r3 = await uc.execute({ ...cmd, displayName: 'Otro Nombre' });
  if (!isFailure(r3) || r3.error.code !== DomainErrorCode.IDEMPOTENCY_KEY_REUSED) {
    throw new Error('r3 should be 409');
  }
  console.log('3. replay divergente: OK (409)');

  // 4. Concurrencia: dos provisiones con la misma clave en paralelo.
  const key2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const cmd2 = { ...cmd, idempotencyKey: key2, email: `target2-${suffix}@example.com` };
  const [c1, c2] = await Promise.all([uc.execute(cmd2), uc.execute(cmd2)]);
  const okCount = [c1, c2].filter(isSuccess).length;
  if (okCount !== 2) throw new Error(`concurrency: expected 2 success, got ${okCount}`);
  const ids = [c1, c2].filter(isSuccess).map((r) => r.value.id);
  if (ids[0] !== ids[1]) throw new Error('concurrency produced two different admins');
  console.log('4. concurrencia misma clave: OK (2 success, 1 admin)');

  // 5. Rollback total: email duplicado dentro de la transacción no deja efectos.
  const key3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const dup = await uc.execute({ ...cmd, idempotencyKey: key3, email: targetEmail });
  if (!isFailure(dup) || dup.error.code !== DomainErrorCode.EMAIL_ALREADY_REGISTERED) {
    throw new Error('dup should be EMAIL_ALREADY_REGISTERED');
  }
  const dupUsers = await prisma.user.count({ where: { email: targetEmail } });
  if (dupUsers !== 1) throw new Error(`rollback: expected 1 user, got ${dupUsers}`);
  console.log('5. rollback total ante fallo: OK (sin efectos parciales)');

  // 6. Invariantes: 1 usuario por email, 1 token, 1 registro idempotente por clave.
  const targetUsers = await prisma.user.count({ where: { email: targetEmail } });
  const tokens = await prisma.adminActivationToken.count({
    where: { createdByUserId: actor.id },
  });
  const records = await prisma.idempotencyRecord.count({
    where: { scope: `admin-provision:${actor.id}` },
  });
  if (targetUsers !== 1) throw new Error(`expected 1 target user, got ${targetUsers}`);
  if (tokens !== 2) throw new Error(`expected 2 tokens, got ${tokens}`);
  if (records !== 2) throw new Error(`expected 2 idempotency records, got ${records}`);
  console.log('6. invariantes: OK (1 user, 2 tokens, 2 records)');

  // Limpieza.
  await prisma.idempotencyRecord.deleteMany({ where: { scope: `admin-provision:${actor.id}` } });
  await prisma.adminActivationToken.deleteMany({ where: { createdByUserId: actor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [actor.id, r1.value.id] } } });

  console.log('\nINTEGRACIÓN MSF-ID-002: TODAS LAS COMPROBACIONES OK');
}

main()
  .catch((e) => {
    console.error('INTEGRACIÓN FALLÓ:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
