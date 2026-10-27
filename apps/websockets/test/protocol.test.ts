import { describe, expect, test } from "bun:test";
import { marketEventSchema, normalizeSymbol, parseClientRequest } from "../src/market/protocol";
import { decodeMarketEvent } from "../src/market/market-data";
import { candleEvent, depthDelta, tickerEvent, tradeEvent } from "./fixtures";

describe("client requests", () => {
  test("single and batch forms; BTC-USDT style symbols are normalised", () => {
    expect(parseClientRequest({ action: "subscribe", channel: "depth", symbol: "BTC-USDT" })).toEqual({
      ok: true,
      request: { action: "subscribe", subscriptions: [{ channel: "depth", symbol: "BTCUSDT" }] },
    });
    const batch = parseClientRequest({
      action: "unsubscribe",
      subscriptions: [{ channel: "candles", symbol: "eth/usdc", interval: "1m" }, { channel: "ticker", symbol: "SOLUSDC" }],
    });
    expect(batch.ok && batch.request.subscriptions).toEqual([
      { channel: "candles", symbol: "ETHUSDC", interval: "1m" },
      { channel: "ticker", symbol: "SOLUSDC" },
    ]);
  });

  test("rejects invalid actions, channels, symbols and intervals", () => {
    for (const p of [
      null,
      "subscribe",
      { action: "delete", channel: "depth", symbol: "BTCUSDC" },
      { action: "subscribe", channel: "orders", symbol: "BTCUSDC" },
      { action: "subscribe", channel: "depth", symbol: "BTC USDC!" },
      { action: "subscribe", channel: "candles", symbol: "BTCUSDC" },
      { action: "subscribe", channel: "candles", symbol: "BTCUSDC", interval: "2m" },
      { action: "subscribe", channel: "ticker", symbol: "BTCUSDC", interval: "1m" },
      { action: "resync", channel: "ticker", symbol: "BTCUSDC" },
      { action: "subscribe", subscriptions: [] },
      { action: "subscribe", subscriptions: Array.from({ length: 26 }, () => ({ channel: "ticker", symbol: "BTCUSDC" })) },
    ]) {
      expect(parseClientRequest(p).ok).toBe(false);
    }
    expect(normalizeSymbol(42)).toBeNull();
  });
});

describe("Kafka event validation", () => {
  test("accepts every v2 event type", () => {
    for (const e of [depthDelta(1, 2), tradeEvent("t"), tickerEvent(1, 1), candleEvent(0, 1)]) {
      expect(marketEventSchema.safeParse(e).success).toBe(true);
    }
  });

  test("decode ignores engine orderbook.updated and drops malformed events", () => {
    const enc = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v));
    expect(decodeMarketEvent(enc({ event: "orderbook.updated", symbol: "BTCUSDC" }))).toBeNull();
    expect(decodeMarketEvent(enc("{nope"))).toBeNull();
    expect(decodeMarketEvent(enc({ ...tradeEvent("t"), schemaVersion: 1 }))).toBeNull();
    expect(decodeMarketEvent(enc({ ...tradeEvent("t"), data: { ...tradeEvent("t").data, price: "-5" } }))).toBeNull();
    expect(decodeMarketEvent(enc({ ...depthDelta(1, 2), sequenceNumber: "x" }))).toBeNull();
    expect(decodeMarketEvent(null)).toBeNull();
    expect(decodeMarketEvent(enc(tradeEvent("ok")))?.type).toBe("trades.updated");
  });
});
