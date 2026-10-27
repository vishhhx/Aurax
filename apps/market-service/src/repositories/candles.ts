import { fromDbDecimal } from "../lib/decimal";
import { Prisma, prisma } from "@repo/pg";
import { CANDLE_INTERVALS, type Candle, type CandleInterval } from "../processors/candle";

/**
 * Upserts candles keyed by the real `@@unique([symbol, interval, openTime])`.
 *
 * `tradeCount` only ever grows for a given candle, so the update is applied
 * only when the incoming revision has at least as many trades as the stored
 * row. A slower or concurrent writer holding an older revision can therefore
 * never overwrite a newer one.
 */
export async function upsertCandles(candles: Candle[]): Promise<void> {
  if (candles.length === 0) return;

  const values = candles.map(
    (c) => Prisma.sql`(
      gen_random_uuid(), ${c.symbol}, ${c.interval}, ${BigInt(c.openTime)},
      ${c.open}::numeric, ${c.high}::numeric, ${c.low}::numeric, ${c.close}::numeric,
      ${c.baseVolume}::numeric, ${c.quoteVolume}::numeric, ${c.tradeCount}, now()
    )`,
  );

  await prisma.$executeRaw`
    INSERT INTO "Candle" ("id", "symbol", "interval", "openTime", "open", "high", "low", "close",
                          "baseVolume", "quoteVolume", "tradeCount", "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("symbol", "interval", "openTime") DO UPDATE SET
      "open" = EXCLUDED."open",
      "high" = EXCLUDED."high",
      "low" = EXCLUDED."low",
      "close" = EXCLUDED."close",
      "baseVolume" = EXCLUDED."baseVolume",
      "quoteVolume" = EXCLUDED."quoteVolume",
      "tradeCount" = EXCLUDED."tradeCount",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "Candle"."tradeCount" <= EXCLUDED."tradeCount"`;
}

/** Persisted candles, oldest first, served by `Candle_symbol_interval_openTime_idx`. */
export async function listCandles(params: {
  symbol: string;
  interval: CandleInterval;
  limit: number;
  startTime?: number;
  endTime?: number;
}): Promise<Candle[]> {
  const { symbol, interval, limit, startTime, endTime } = params;
  const duration = CANDLE_INTERVALS[interval];
  const now = Date.now();

  const rows = await prisma.candle.findMany({
    where: {
      symbol,
      interval,
      ...(startTime !== undefined || endTime !== undefined
        ? {
            openTime: {
              ...(startTime !== undefined ? { gte: BigInt(startTime) } : {}),
              ...(endTime !== undefined ? { lte: BigInt(endTime) } : {}),
            },
          }
        : {}),
    },
    orderBy: { openTime: "desc" },
    take: limit,
  });

  return rows.reverse().map((r) => {
    const openTime = Number(r.openTime);
    return {
      symbol: r.symbol,
      interval,
      openTime,
      closeTime: openTime + duration,
      open: fromDbDecimal(r.open),
      high: fromDbDecimal(r.high),
      low: fromDbDecimal(r.low),
      close: fromDbDecimal(r.close),
      baseVolume: fromDbDecimal(r.baseVolume),
      quoteVolume: fromDbDecimal(r.quoteVolume),
      tradeCount: r.tradeCount,
      isClosed: now >= openTime + duration,
      updatedAt: r.updatedAt.getTime(),
    };
  });
}
