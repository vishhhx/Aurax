import { describe, expect, test } from "bun:test";
import { TOPICS } from "@repo/kafka";
import { CompressionTypes, type ProducerRecord } from "kafkajs";
import {
  diffDepth,
  MarketPublisher,
  toDepthDeltaEvent,
  toDepthSnapshotEvent,
  toTickerEvent,
  toTradeEvent,
  topN,
  type DepthView,
} from "../src/producers/market";
import { toCandleEvent } from "../src/producers/candle";
import { TickerStore } from "../src/store/ticker";
import { TickerAggregator } from "../src/processors/tickers";
import { CandleAggregator } from "../src/processors/candle";
import { T0, trade } from "./helpers";

const L = (price: string, quantity: string) => ({ price, quantity });

/** Reference consumer logic: apply a delta to a view (upsert, "0" removes). */
function applyDelta(view: DepthView, delta: DepthView): DepthView {
  const side = (levels: typeof view.bids, changes: typeof view.bids, desc: boolean) => {
    const m = new Map(levels.map((l) => [l.price, l.quantity]));
    for (const c of changes) (c.quantity === "0" ? m.delete(c.price) : m.set(c.price, c.quantity));
    return [...m].map(([price, quantity]) => ({ price, quantity })).sort((a, b) => (desc ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price)));
  };
  return { bids: side(view.bids, delta.bids, true), asks: side(view.asks, delta.asks, false) };
}

describe("MarketPublisher", () => {
  test("market.events, symbol keys, GZIP, acks=-1, headers and one batched request", async () => {
    const sent: ProducerRecord[] = [];
    const publisher = new MarketPublisher(async (r) => void sent.push(r));
    const t = trade({ symbol: "ETHUSDC" });

    await publisher.publish([toTradeEvent(t, T0), toTradeEvent({ ...t, tradeId: "x2" }, T0)]);

    expect(sent).toHaveLength(1);
    const record = sent[0]!;
    expect(record.topic).toBe(TOPICS.MARKET_EVENTS);
    expect(record.compression).toBe(CompressionTypes.GZIP);
    expect(record.acks).toBe(-1);
    expect(record.messages.map((m) => m.key)).toEqual(["ETHUSDC", "ETHUSDC"]);
    expect(record.messages[0]!.headers).toEqual({
      "event-type": "trades.updated",
      "event-id": `trades:ETHUSDC:${t.tradeId}`,
      "schema-version": "2",
    });

    expect(JSON.parse(String(record.messages[0]!.value))).toEqual({
      eventId: `trades:ETHUSDC:${t.tradeId}`,
      type: "trades.updated",
      schemaVersion: 2,
      symbol: "ETHUSDC",
      sequenceNumber: null,
      timestamp: T0,
      data: {
        tradeId: t.tradeId,
        price: "100",
        quantity: "1",
        quoteQuantity: "100",
        side: "BUY",
        isBuyerMaker: false,
        executedAt: T0,
      },
    });
  });

  test("published-events metric counts each event under its own type", async () => {
    const { metrics } = await import("../src/lib/metrics");
    metrics.reset();
    const publisher = new MarketPublisher(async () => undefined);
    const ticker = new TickerAggregator(new TickerStore()).processTrade(trade(), T0).ticker;
    await publisher.publish([toTradeEvent(trade()), toTickerEvent(ticker), toTickerEvent(ticker)]);
    expect(metrics.get("market_events_published_total", { type: "trades.updated" })).toBe(1);
    expect(metrics.get("market_events_published_total", { type: "ticker.updated" })).toBe(2);
  });

  test("empty batches send nothing; failures propagate", async () => {
    let calls = 0;
    await new MarketPublisher(async () => void calls++).publish([]);
    expect(calls).toBe(0);

    const failing = new MarketPublisher(async () => {
      throw new Error("broker unavailable");
    });
    await expect(failing.publish([toTradeEvent(trade())])).rejects.toThrow("broker unavailable");
  });
});

describe("event builders", () => {
  test("ticker: string sequence, deterministic per-boot event IDs", () => {
    const ticker = new TickerAggregator(new TickerStore()).processTrade(trade({ price: "0.0000001" }), T0).ticker;
    const e = JSON.parse(JSON.stringify(toTickerEvent(ticker, T0)));
    expect(e).toMatchObject({ type: "ticker.updated", sequenceNumber: "1", data: { lastPrice: "0.0000001", baseVolume24h: "1" } });
    expect(e.eventId).toMatch(/^ticker:BTCUSDC:[0-9a-f]{8}:1$/);
    expect(toTickerEvent(ticker, T0 + 1).eventId).toBe(e.eventId);
  });

  test("candle: revision is the trade count, closed and open revisions differ", () => {
    const [candle] = new CandleAggregator().processTrade(trade(), T0);
    const open = toCandleEvent(candle!, T0);
    expect(open).toMatchObject({ type: "candles.updated", sequenceNumber: "1", data: { interval: "1m", tradeCount: 1, isClosed: false } });
    expect(toCandleEvent({ ...candle!, isClosed: true }).eventId).not.toBe(open.eventId);
  });

  test("depth snapshot and delta envelopes", () => {
    const snap = toDepthSnapshotEvent("BTCUSDC", 12345678901234567890n, { bids: [L("1", "1")], asks: [] }, 50, T0);
    expect(snap).toMatchObject({
      eventId: "depth:BTCUSDC:snapshot:12345678901234567890",
      sequenceNumber: "12345678901234567890",
      data: { kind: "snapshot", depth: 50 },
    });
    const delta = toDepthDeltaEvent("BTCUSDC", 8n, 7n, { bids: [], asks: [L("2", "0")] }, 50, T0);
    expect(delta).toMatchObject({ eventId: "depth:BTCUSDC:delta:7:8", data: { kind: "delta", prevSequenceNumber: "7" } });
  });

  test("diffDepth reproduces the next top-N view exactly when applied", () => {
    const random = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const rnd = random(7);
    const book = () => {
      const bids = new Map<number, string>();
      const asks = new Map<number, string>();
      for (let i = 0; i < 15; i++) {
        bids.set(90 + Math.floor(rnd() * 10), String(1 + Math.floor(rnd() * 5)));
        asks.set(101 + Math.floor(rnd() * 10), String(1 + Math.floor(rnd() * 5)));
      }
      return {
        bids: [...bids].sort((a, b) => b[0] - a[0]).map(([p, q]) => L(String(p), q)),
        asks: [...asks].sort((a, b) => a[0] - b[0]).map(([p, q]) => L(String(p), q)),
      };
    };

    let view = topN(book(), 5);
    for (let i = 0; i < 200; i++) {
      const next = topN(book(), 5);
      view = applyDelta(view, diffDepth(view, next));
      expect(view).toEqual(next);
    }
  });
});
