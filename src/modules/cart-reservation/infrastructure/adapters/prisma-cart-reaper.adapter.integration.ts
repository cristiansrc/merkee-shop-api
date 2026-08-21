import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaCartReaperAdapter } from './prisma-cart-reaper.adapter';

/**
 * Regresión contra PostgreSQL real: `SET LOCAL statement_timeout` no debe
 * enviarse como parámetro ($1), porque PostgreSQL lo rechaza con 42601.
 *
 * Ejecutar exclusivamente contra la base local de integración:
 * `npm run test:integration`.
 */
describe('PrismaCartReaperAdapter (PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/merkee_shop?schema=public',
      },
    },
  });

  const categoryId = randomUUID();
  const productId = randomUUID();
  const now = new Date('2026-08-19T12:00:00.000Z');
  const reservationIds = [randomUUID(), randomUUID(), randomUUID()];
  const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
  const cartIds = [randomUUID(), randomUUID(), randomUUID()];
  const cartItemIds = [randomUUID(), randomUUID(), randomUUID()];
  let setupComplete = false;

  beforeAll(async () => {
    await prisma.$connect();

    const timestamp = new Date('2026-08-19T11:00:00.000Z');
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `Reaper test ${categoryId}`,
        imageKey: `reaper-test/${categoryId}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        categoryId,
        name: `Reaper product ${productId}`,
        description: 'Synthetic integration fixture',
        regularPriceCop: 1000n,
        salePriceCop: 1000n,
        unit: 'unit',
        stockOnHand: 20,
        stockReserved: 5,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    for (let i = 0; i < 3; i++) {
      await prisma.session.create({
        data: {
          id: sessionIds[i],
          sessionKind: 'GUEST',
          refreshTokenHash: `reaper-test-${sessionIds[i]}`,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
          lastActivityAt: timestamp,
          createdAt: timestamp,
        },
      });
      await prisma.cart.create({
        data: {
          id: cartIds[i],
          sessionId: sessionIds[i],
          status: i === 1 ? 'CHECKOUT_PENDING' : 'ACTIVE',
          itemsSubtotalCop: 1000n,
          deliveryFeeCop: 5000n,
          ivaCop: 190n,
          taxRateBasisPoints: 1900,
          totalCop: 6190n,
          reservationExpiresAt: i === 1 ? null : new Date(now.getTime() - 1000),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      await prisma.cartItem.create({
        data: {
          id: cartItemIds[i],
          cartId: cartIds[i],
          productId,
          quantity: i === 0 ? 2 : 1,
          unitPriceCop: 1000n,
          subtotalCop: i === 0 ? 2000n : 1000n,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }

    await prisma.stockReservation.createMany({
      data: [
        {
          id: reservationIds[0],
          cartItemId: cartItemIds[0],
          productId,
          quantity: 2,
          status: 'ACTIVE',
          expiresAt: new Date(now.getTime() - 1000),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: reservationIds[1],
          cartItemId: cartItemIds[1],
          productId,
          quantity: 1,
          status: 'CHECKOUT_PENDING',
          expiresAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: reservationIds[2],
          cartItemId: cartItemIds[2],
          productId,
          quantity: 2,
          status: 'ACTIVE',
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });
    setupComplete = true;
  });

  afterAll(async () => {
    if (!setupComplete) {
      await prisma.$disconnect();
      return;
    }
    await prisma.stockReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.cartItem.deleteMany({ where: { id: { in: cartItemIds } } });
    await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('ejecuta SET LOCAL y expira solo ACTIVE vencidas conservando stock_reserved', async () => {
    const adapter = new PrismaCartReaperAdapter(prisma as never);

    await expect(adapter.expireBatch(now, 500)).resolves.toEqual({
      selected: 1,
      released: 1,
      skippedTerminal: 0,
    });

    const reservations = await prisma.stockReservation.findMany({
      where: { id: { in: reservationIds } },
      orderBy: { id: 'asc' },
    });
    const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));

    expect(byId.get(reservationIds[0])?.status).toBe('EXPIRED');
    expect(byId.get(reservationIds[1])?.status).toBe('CHECKOUT_PENDING');
    expect(byId.get(reservationIds[2])?.status).toBe('ACTIVE');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockReserved).toBe(3);
  });
});
