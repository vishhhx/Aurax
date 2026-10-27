import { describe, expect, test } from "bun:test";
import { CandleAggregator } from "../src/processors/candle";
import { T0, trade } from "./helpers";

const MIN = 60_000;

describe("CandleAggregator", () => {
  test("open times align to interval boundaries (UTC)", () => {
    const c = new CandleAggregator();
    const ts = T0 + 7 * MIN + 13_000; // 12:07:13
    const touched = c.processTrade(trade({ timestamp: ts }), ts);
    const byInterval = Object.fromEntries(touched.map((x) => [x.interval, x.openTime]));
    expect(byInterval["1m"]).toBe(T0 + 7 * MIN);
    expect(byInterval["5m"]).toBe(T0 + 5 * MIN);
    expect(byInterval["15m"]).toBe(T0);
    expect(byInterval["1h"]).toBe(T0);
    expect(byInterval["1d"]).toBe(Date.UTC(2026, 9, 25));
    expect(touched.find((x) => x.interval === "1m")!.closeTime).toBe(T0 + 8 * MIN);
  });

  test("OHLC and volumes are exact; ordering by timestamp then tradeId", () => {
    const c = new CandleAggregator();
    c.processTrade(trade({ timestamp: T0 + 10_000, price: "101", quantity: "0.5" }), T0 + 50_000);
    c.processTrade(trade({ timestamp: T0 + 1_000, price: "100", quantity: "0.25" }), T0 + 50_000); // late: becomes open
    c.processTrade(trade({ timestamp: T0 + 20_000, price: "104.5", quantity: "1" }), T0 + 50_000);
    c.processTrade(trade({ timestamp: T0 + 30_000, price: "99.9", quantity: "0.1" }), T0 + 50_000);

    const [m] = c.getCandles("BTCUSDC", "1m", {}, T0 + 50_000);
    expect(m).toMatchObject({
      open: "100",
      high: "104.5",
      low: "99.9",
      close: "99.9",
      baseVolume: "1.85",
      quoteVolume: "189.99", // 50.5 + 25 + 104.5 + 9.99
      tradeCount: 4,
      isClosed: false,
    });
  });

  test("duplicate trades never double-count", () => {
    const c = new CandleAggregator();
    const t = trade({ quantity: "3" });
    expect(c.processTrade(t, T0)).toHaveLength(5);
    expect(c.processTrade(t, T0)).toHaveLength(0);
    expect(c.getCandles("BTCUSDC", "1h", {}, T0)[0]!.baseVolume).toBe("3");
  });

  test("dirty revisions: only acknowledged revisions are cleared", () => {
    const c = new CandleAggregator();
    c.processTrade(trade({ timestamp: T0 }), T0);
    const batch = c.getDirtyCandles();
    expect(batch).toHaveLength(5);

    // The 1m candle changes while the batch is being written
    c.processTrade(trade({ timestamp: T0 + 1 }), T0);
    c.acknowledgePersisted(batch);
    const remaining = c.getDirtyCandles();
    expect(remaining).toHaveLength(5); // all five intervals have a newer revision
    expect(remaining.every((d) => d.candle.tradeCount === 2)).toBe(true);
  });

  test("close detection publishes each closed candle once, and again after a late revision", () => {
    const c = new CandleAggregator();
    c.processTrade(trade({ timestamp: T0 }), T0);
    expect(c.collectNewlyClosed(T0 + 30_000)).toHaveLength(0);

    const closed = c.collectNewlyClosed(T0 + MIN);
    expect(closed.map((x) => x.interval)).toEqual(["1m"]);
    expect(closed[0]!.isClosed).toBe(true);
    expect(c.collectNewlyClosed(T0 + MIN + 1)).toHaveLength(0);

    c.processTrade(trade({ timestamp: T0 + 5_000 }), T0 + MIN + 2); // late trade revises closed 1m candle
    expect(c.collectNewlyClosed(T0 + MIN + 3).map((x) => x.interval)).toEqual(["1m"]);
  });

  test("memory is bounded and trades older than an evicted candle are ignored", () => {
    const c = new CandleAggregator({ maxCandlesPerInterval: 3 });
    for (let i = 0; i < 5; i++) c.processTrade(trade({ timestamp: T0 + i * MIN }), T0 + 5 * MIN);
    expect(c.getCandles("BTCUSDC", "1m", { limit: 100 })).toHaveLength(3);

    const late = c.processTrade(trade({ timestamp: T0 }), T0 + 5 * MIN);
    expect(late.some((x) => x.interval === "1m")).toBe(false);
    // Evicted candles keep their dirty revision until persisted
    expect(c.getDirtyCandles().filter((d) => d.candle.interval === "1m")).toHaveLength(5);
  });

  test("range and limit filters", () => {
    const c = new CandleAggregator();
    for (let i = 0; i < 10; i++) c.processTrade(trade({ timestamp: T0 + i * MIN }), T0);
    expect(c.getCandles("BTCUSDC", "1m", { limit: 3 }).map((x) => x.openTime)).toEqual([
      T0 + 7 * MIN,
      T0 + 8 * MIN,
      T0 + 9 * MIN,
    ]);
    expect(c.getCandles("BTCUSDC", "1m", { startTime: T0 + 2 * MIN, endTime: T0 + 4 * MIN })).toHaveLength(3);
  });
});
