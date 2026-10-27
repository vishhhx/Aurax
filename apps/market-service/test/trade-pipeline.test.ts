import { describe, expect, test } from "bun:test";
import { toPublicTrade } from "../src/processors/trade-pipeline";
import { FakeTradeRepo, makePipeline } from "./fakes";
import { engineTrade, T0 } from "./helpers";

describe("toPublicTrade", () => {
  test("public side is the taker side; isBuyerMaker follows the maker", () => {
    const t = toPublicTrade(engineTrade({ price: "2.5", quantity: "4" }));
    expect(t.side).toBe("BUY");
    expect(t.isBuyerMaker).toBe(false);
    expect(t.quoteQuantity).toBe("10");

    const sell = toPublicTrade(
      engineTrade({
        maker: { orderId: "m", userId: "u", status: "FILLED", side: "BUY" },
        taker: { orderId: "t", userId: "v", status: "FILLED", side: "SELL" },
      }),
    );
    expect(sell.side).toBe("SELL");
    expect(sell.isBuyerMaker).toBe(true);
  });
});

describe("TradePipeline", () => {
  test("applies a new trade to every store and publishes trade, ticker and 5 candles", async () => {
    const p = makePipeline();
    expect(await p.pipeline.handle(engineTrade({ quantity: "2" }))).toBe("applied");

    expect(p.recent.getRecentTrades("BTCUSDC")).toHaveLength(1);
    expect(p.tickerStore.getTicker("BTCUSDC")!.baseVolume24h).toBe("2");
    expect(p.published.map((e) => e.type)).toEqual([
      "trades.updated",
      "ticker.updated",
      "candles.updated",
      "candles.updated",
      "candles.updated",
      "candles.updated",
      "candles.updated",
    ]);
    expect(p.published[0]).toMatchObject({
      eventId: expect.stringMatching(/^trades:BTCUSDC:/),
      schemaVersion: 2,
      sequenceNumber: null,
      data: { price: "100", quantity: "2", quoteQuantity: "200", side: "BUY", isBuyerMaker: false },
    });
    // Never leaks user or order identifiers
    expect(JSON.stringify(p.published)).not.toMatch(/userId|orderId|u1|u2/);
  });

  test("Kafka redelivery does not double-count or re-publish", async () => {
    const p = makePipeline();
    const e = engineTrade({ quantity: "2" });
    await p.pipeline.handle(e);
    const before = p.published.length;
    expect(await p.pipeline.handle(e)).toBe("duplicate");
    expect(p.published.length).toBe(before);
    expect(p.tickerStore.getTicker("BTCUSDC")!.baseVolume24h).toBe("2");
    expect(p.candles.getCandles("BTCUSDC", "1m")[0]!.baseVolume).toBe("2");
  });

  test("a failed publish is retried on redelivery without re-aggregating", async () => {
    const p = makePipeline({ failPublish: 1 });
    const e = engineTrade({ quantity: "1.5" });
    await expect(p.pipeline.handle(e)).rejects.toThrow("kafka down");
    // Kafka redelivers the same message
    expect(await p.pipeline.handle(e)).toBe("duplicate");
    expect(p.published.filter((x) => x.type === "trades.updated")).toHaveLength(1);
    expect(p.tickerStore.getTicker("BTCUSDC")!.baseVolume24h).toBe("1.5");
  });

  test("a database failure leaves state untouched so the retry applies it once", async () => {
    const repo = new FakeTradeRepo();
    repo.failNext = 1;
    const p = makePipeline({ repo });
    const e = engineTrade();
    await expect(p.pipeline.handle(e)).rejects.toThrow("db down");
    expect(p.tickerStore.getTicker("BTCUSDC")).toBeUndefined();
    expect(await p.pipeline.handle(e)).toBe("applied");
    expect(p.tickerStore.getTicker("BTCUSDC")!.tradeCount24h).toBe(1);
  });

  test("historical replay updates state but is not re-broadcast", async () => {
    const p = makePipeline({ now: T0 + 10 * 60_000 });
    expect(await p.pipeline.handle(engineTrade({ timestamp: T0 }))).toBe("applied");
    expect(p.published).toHaveLength(0);
    expect(p.candles.getCandles("BTCUSDC", "1m")).toHaveLength(1);
  });

  test("trades for markets this instance does not serve are skipped", async () => {
    const p = makePipeline();
    expect(await p.pipeline.handle(engineTrade({ symbol: "DOGEUSDC" }))).toBe("unknown_market");
    expect(p.repo.rows.size).toBe(0);
  });
});
