/**
 * Matching-engine events → consumer handling → market state, without a broker:
 * raw Kafka message bytes go through the real parser, pipeline and order-book
 * sync. Covers redelivery, out-of-order trades and a process restart.
 */
import { describe, expect, test } from "bun:test";
import { processMessage } from "../src/consumers/runner";
import { reconstructMarketState } from "../src/market/reconstruct";
import { OrderBookSync } from "../src/processors/orderbook-sync";
import { OrderBookStore } from "../src/store/orderbook";
import {
  orderBookUpdatedSchema,
  tradeExecutedSchema,
  type OrderBookUpdatedEvent,
  type TradeExecutedEvent,
} from "../src/types/engine-events";
import { engineTrade, T0 } from "./helpers";
import { FakeTradeRepo, makePipeline } from "./fakes";

const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));

describe("engine → market-service", () => {
  test("trades and order-book snapshots flow into state and derived events", async () => {
    const p = makePipeline();
    const tradeSpec = {
      topic: "trade.executed",
      eventName: "trade.executed",
      schema: tradeExecutedSchema,
      handle: (e: TradeExecutedEvent) => p.pipeline.handle(e),
    };

    const t1 = engineTrade({ price: "100", quantity: "0.5", timestamp: T0 });
    const t2 = engineTrade({ price: "102", quantity: "0.25", timestamp: T0 + 500 });
    const t0 = engineTrade({ price: "99", quantity: "1", timestamp: T0 - 500 }); // arrives late

    for (const [i, e] of [t1, t2, t1, t0].entries()) {
      await processMessage(tradeSpec, { value: bytes(e), offset: String(i) }, 0);
    }

    const ticker = p.tickerStore.getTicker("BTCUSDC")!;
    expect(ticker.tradeCount24h).toBe(3);
    expect(ticker.baseVolume24h).toBe("1.75");
    expect(ticker.open24h).toBe("99");
    expect(ticker.lastPrice).toBe("102");
    expect(p.recent.getRecentTrades("BTCUSDC").map((t) => t.price)).toEqual(["102", "100", "99"]);

    // Order book
    const store = new OrderBookStore();
    const sync = new OrderBookSync({
      store,
      fetchSnapshot: async () => ({ symbol: "BTCUSDC", sequenceNumber: "1", bids: [], asks: [] }),
      publisher: { publish: async () => undefined },
      depthLevels: 10,
      isServed: () => true,
    });
    await sync.initialize(["BTCUSDC"]);
    const bookSpec = {
      topic: "market.events",
      eventName: "orderbook.updated",
      schema: orderBookUpdatedSchema,
      handle: (e: OrderBookUpdatedEvent, ctx: { offset: bigint }) => sync.handleKafka(e, ctx.offset),
    };
    const book = (seq: number) =>
      bytes({
        event: "orderbook.updated",
        symbol: "BTCUSDC",
        sequenceNumber: String(seq),
        bids: [{ price: "99.5", quantity: String(0.1 + 0.2) }],
        asks: [{ price: "100.5", quantity: "2" }],
        timestamp: T0,
      });
    await processMessage(bookSpec, { value: book(2), offset: "10" }, 0);
    await processMessage(bookSpec, { value: book(2), offset: "10" }, 0); // redelivery
    expect(store.get("BTCUSDC")!.bids[0]!.quantity).toBe("0.30000000000000004");
    expect(store.get("BTCUSDC")!.sequenceNumber).toBe(2n);
  });

  test("restart: state rebuilt from MarketTrade, then Kafka replay does not double-count", async () => {
    const repo = new FakeTradeRepo();
    const now = T0 + 5_000;
    const before = makePipeline({ repo, now });
    const events = [1, 2, 3].map((i) => engineTrade({ quantity: String(i), timestamp: T0 + i }));
    for (const e of events) await before.pipeline.handle(e);
    const expectedVolume = before.tickerStore.getTicker("BTCUSDC")!.baseVolume24h;
    const expectedCandle = before.candles.getCandles("BTCUSDC", "1h", {}, now)[0];

    // "Crash": fresh in-memory state, same durable MarketTrade rows.
    const after = makePipeline({ repo, now });
    await reconstructMarketState({
      symbols: ["BTCUSDC"],
      pipeline: after.pipeline,
      ticker: after.ticker,
      now,
      stream: async function* () {
        yield [...repo.rows.values()].sort((a, b) => a.timestamp - b.timestamp);
      },
    });

    // Kafka redelivers everything after the last committed offset.
    for (const e of events) expect(await after.pipeline.handle(e)).toBe("duplicate");

    expect(after.tickerStore.getTicker("BTCUSDC")!.baseVolume24h).toBe(expectedVolume);
    expect(after.candles.getCandles("BTCUSDC", "1h", {}, now)[0]).toMatchObject({
      baseVolume: expectedCandle!.baseVolume,
      tradeCount: 3,
      open: expectedCandle!.open,
      close: expectedCandle!.close,
    });
    expect(after.recent.getRecentTrades("BTCUSDC")).toHaveLength(3);
  });
});
