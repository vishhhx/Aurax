/**
 * Real-Postgres tests for the SQL that matters most. Opt-in, run alone:
 *   RUN_DB_TESTS=1 bun test test/db.test.ts
 * Uses a reserved symbol and deletes its rows before and after.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const enabled = process.env.RUN_DB_TESTS === "1";
const SYMBOL = "ZZTESTUSDC";

describe.skipIf(!enabled)("Postgres repositories", async () => {
  const { prisma } = await import("@repo/pg");
  const { upsertCandles, listCandles } = await import("../src/repositories/candles");
  const { tradeRepo } = await import("../src/repositories/trades");

  const cleanup = async () => {
    await prisma.candle.deleteMany({ where: { symbol: SYMBOL } });
    await prisma.marketTrade.deleteMany({ where: { symbol: SYMBOL } });
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const candle = (tradeCount: number, close: string) => ({
    symbol: SYMBOL,
    interval: "1m" as const,
    openTime: 1_700_000_000_000,
    closeTime: 1_700_000_060_000,
    open: "100",
    high: "110.123456789012345678",
    low: "0.0000001",
    close,
    baseVolume: "123456789.000000000000000001",
    quoteVolume: "1",
    tradeCount,
    isClosed: true,
    updatedAt: 0,
  });

  test("candle upsert inserts, updates newer revisions, and rejects stale ones", async () => {
    await upsertCandles([candle(2, "101")]);
    await upsertCandles([candle(5, "105")]);
    await upsertCandles([candle(3, "103")]); // older revision must not overwrite

    const [row] = await listCandles({ symbol: SYMBOL, interval: "1m", limit: 10 });
    expect(row).toMatchObject({
      close: "105",
      tradeCount: 5,
      high: "110.123456789012345678",
      low: "0.0000001",
      baseVolume: "123456789.000000000000000001",
    });
  });

  test("MarketTrade insert is idempotent and history paginates deterministically", async () => {
    const base = {
      symbol: SYMBOL,
      price: "0.0000001",
      quantity: "2",
      quoteQuantity: "0.0000002",
      side: "SELL" as const,
      isBuyerMaker: true,
    };
    // Two trades share a timestamp to exercise the tradeId tie-break.
    const trades = [
      { ...base, tradeId: "zz-a", timestamp: 1000 },
      { ...base, tradeId: "zz-b", timestamp: 2000 },
      { ...base, tradeId: "zz-c", timestamp: 2000 },
    ];
    for (const t of trades) expect(await tradeRepo.insertIfAbsent(t)).toBe(true);
    expect(await tradeRepo.insertIfAbsent(trades[0]!)).toBe(false);

    const p1 = await tradeRepo.listHistorical({ symbol: SYMBOL, limit: 2 });
    expect(p1.trades.map((t) => t.tradeId)).toEqual(["zz-c", "zz-b"]);
    expect(p1.trades[0]).toMatchObject({ price: "0.0000001", side: "SELL", isBuyerMaker: true });
    expect(p1.nextCursor).not.toBeNull();

    const { decodeCursor } = await import("../src/repositories/trades");
    const p2 = await tradeRepo.listHistorical({ symbol: SYMBOL, limit: 2, cursor: decodeCursor(p1.nextCursor!)! });
    expect(p2.trades.map((t) => t.tradeId)).toEqual(["zz-a"]);
    expect(p2.nextCursor).toBeNull();

    const streamed: string[] = [];
    for await (const batch of tradeRepo.streamSince([SYMBOL], 0, 2)) streamed.push(...batch.map((t) => t.tradeId));
    expect(streamed).toEqual(["zz-a", "zz-b", "zz-c"]);

    expect(await tradeRepo.findById(SYMBOL, "zz-b")).toMatchObject({ timestamp: 2000 });
  });
});
