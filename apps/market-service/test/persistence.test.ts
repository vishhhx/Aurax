import { describe, expect, test } from "bun:test";
import { CandleAggregator, type Candle } from "../src/processors/candle";
import { CandlePersistenceWorker } from "../src/workers/candle-persistence";
import { T0, trade } from "./helpers";

describe("CandlePersistenceWorker", () => {
  test("acknowledges only what was written; failures keep candles dirty", async () => {
    const agg = new CandleAggregator();
    agg.processTrade(trade({ timestamp: T0 }), T0);

    let fail = true;
    const written: Candle[] = [];
    const worker = new CandlePersistenceWorker(
      agg,
      async (c) => {
        if (fail) throw new Error("db down");
        written.push(...c);
      },
      1_000,
    );

    await expect(worker.flush()).rejects.toThrow("db down");
    expect(agg.getDirtyCount()).toBe(5);

    fail = false;
    expect(await worker.flush()).toBe(5);
    expect(agg.getDirtyCount()).toBe(0);
    expect(written).toHaveLength(5);
  });

  test("a candle updated during the write stays dirty with the newer revision", async () => {
    const agg = new CandleAggregator();
    agg.processTrade(trade({ timestamp: T0 }), T0);

    const worker = new CandlePersistenceWorker(
      agg,
      async () => {
        // Concurrent trade lands mid-write
        agg.processTrade(trade({ timestamp: T0 + 1 }), T0);
      },
      1_000,
    );

    await worker.flush();
    const dirty = agg.getDirtyCandles();
    expect(dirty).toHaveLength(5);
    expect(dirty.every((d) => d.candle.tradeCount === 2)).toBe(true);
  });

  test("large backlogs are written in bounded batches", async () => {
    const agg = new CandleAggregator({ maxCandlesPerInterval: 2_000 });
    for (let i = 0; i < 1_200; i++) agg.processTrade(trade({ timestamp: T0 + i * 60_000 }), T0);
    const sizes: number[] = [];
    const worker = new CandlePersistenceWorker(agg, async (c) => void sizes.push(c.length), 1_000);
    await worker.flush();
    expect(Math.max(...sizes)).toBeLessThanOrEqual(500);
    expect(agg.getDirtyCount()).toBe(0);
  });

  test("stop() performs a final flush", async () => {
    const agg = new CandleAggregator();
    agg.processTrade(trade(), T0);
    let writes = 0;
    const worker = new CandlePersistenceWorker(agg, async (c) => void (writes += c.length), 60_000);
    worker.start();
    await worker.stop();
    expect(writes).toBe(5);
  });
});
