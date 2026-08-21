import { PrismaCartReaperAdapter } from './prisma-cart-reaper.adapter';

function sqlOf(arg: unknown): string {
  const sql = arg as { strings?: readonly string[] };
  return sql?.strings ? sql.strings.join('') : String(arg);
}

describe('PrismaCartReaperAdapter', () => {
  it('configura statement_timeout como literal interno y no como parámetro SQL', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const adapter = new PrismaCartReaperAdapter(prisma as never);

    await expect(
      adapter.expireBatch(new Date('2026-08-19T12:00:00.000Z'), 500),
    ).resolves.toEqual({ selected: 0, released: 0, skippedTerminal: 0 });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const timeoutSql = sqlOf(tx.$executeRaw.mock.calls[0][0]);
    expect(timeoutSql).toContain("SET LOCAL statement_timeout = '5000ms'");
    expect(timeoutSql).not.toContain('$1');
  });
});
