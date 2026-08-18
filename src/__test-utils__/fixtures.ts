/**
 * Test fixtures for integration tests.
 *
 * Provides deterministic data for identity, catalog, cart, and payment modules.
 * All data is synthetic and contains no real PII, secrets, or credentials.
 */
import { createHash } from 'crypto';

// ── Identity fixtures ──

export const FIXED_NOW = new Date('2026-08-17T12:00:00.000Z');

export const ADMIN_EMAIL = 'admin-test@example.com';
export const ADMIN_PASSWORD = 'Test-Admin-123456';
export const ADMIN_DISPLAY_NAME = 'Admin Test';

export const CLIENT_EMAIL = 'client-test@example.com';
export const CLIENT_PASSWORD = 'Test-Client-123456';
export const CLIENT_DISPLAY_NAME = 'Client Test';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ── Catalog fixtures ──

export const CATEGORY_ID = '00000000-0000-0000-0000-000000000001';
export const CATEGORY_NAME = 'Test Category';
export const CATEGORY_SLUG = 'test-category';

export const PRODUCT_ID = '00000000-0000-0000-0000-000000000010';
export const PRODUCT_NAME = 'Test Product';
export const PRODUCT_SLUG = 'test-product';
export const PRODUCT_REGULAR_PRICE = 25000n;
export const PRODUCT_SALE_PRICE = 20000n;
export const PRODUCT_STOCK = 100;

export const BANNER_ID = '00000000-0000-0000-0000-000000000020';
export const BANNER_TITLE = 'Test Banner';

// ── Cart fixtures ──

export const CART_ITEM_QUANTITY = 2;

/**
 * Clean identity-related test data from the database.
 * Uses raw SQL to avoid Prisma model dependencies.
 */
export async function cleanupIdentityTestData(prisma: any): Promise<void> {
  // Clean in dependency order - only identity tables
  await prisma.$executeRaw`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test-%' OR email = ${ADMIN_EMAIL} OR email = ${CLIENT_EMAIL})`;
  await prisma.$executeRaw`DELETE FROM admin_activation_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test-%' OR email = ${ADMIN_EMAIL} OR email = ${CLIENT_EMAIL})`;
  await prisma.$executeRaw`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test-%' OR email = ${ADMIN_EMAIL} OR email = ${CLIENT_EMAIL})`;
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE '%test-%' OR email = ${ADMIN_EMAIL} OR email = ${CLIENT_EMAIL}`;
}

/**
 * Clean all test data from the database.
 * Uses raw SQL to avoid Prisma model dependencies.
 */
export async function cleanupTestDatabase(prisma: any): Promise<void> {
  await cleanupIdentityTestData(prisma);
}
