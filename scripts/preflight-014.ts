/**
 * Preflight check for migration 014: verifies no duplicate active tokens exist
 * before applying the unique index.
 *
 * Run: npx ts-node scripts/preflight-014.ts
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/merkee_shop?schema=public',
      },
    },
  });

  try {
    console.log('=== Preflight 014: Checking for duplicate active password reset tokens ===');

    const duplicates = await prisma.$queryRaw<{ user_id: string; count: bigint }[]>`
      SELECT user_id, count(*) as count
      FROM password_reset_tokens
      WHERE used_at IS NULL
      GROUP BY user_id
      HAVING count(*) > 1
    `;

    if (duplicates.length > 0) {
      console.error('FAILED: Found duplicate active password reset tokens:');
      for (const dup of duplicates) {
        console.error(`  user_id=${dup.user_id}, count=${dup.count}`);
      }
      console.error('Resolve duplicates before applying migration 014.');
      process.exit(1);
    }

    console.log('PASSED: No duplicate active password reset tokens found.');
    console.log('Migration 014 can be safely applied.');

    // Also check migration status (only if migrations table exists)
    try {
      const migrations = await prisma.$queryRaw<{ migration_name: string; applied_at: Date }[]>`
        SELECT migration_name, applied_at
        FROM _prisma_migrations
        WHERE applied_at IS NOT NULL
        ORDER BY applied_at DESC
        LIMIT 5
      `;

      console.log('\nRecent migrations:');
      for (const m of migrations) {
        console.log(`  ${m.migration_name} (applied: ${m.applied_at.toISOString()})`);
      }
    } catch {
      console.log('\nNote: _prisma_migrations table not found (db push mode).');
    }
  } catch (error) {
    console.error('Preflight check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
