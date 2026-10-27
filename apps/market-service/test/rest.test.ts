import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Candle } from "../src/processors/candle";
import type { PublicTrade } from "../src/store/trades";

// DB-backed repositories are replaced; everything else is the real app.
let storedCandles: Candle[] = [];
let historyCalls: unknown[] = [];
let dbFails = false;

mock.module("../src/repositories/candles", () => ({
  upsertCandles: async () => undefined,
  listCandles: async (p: { interval: string; limit: number }) => {
    if (dbFails) throw new Error("connection refused at 10.0.0.5:5432");
    return storedCandles.filter((c) => c.interval === p.interval).slice(-p.limit);
  },
}));

mock.module("../src/repositories/trades", () => {
  const encode = (c: { timestamp: number; tradeId: string }) =>
    Buffer.from(`${c.timestamp}:${c.tradeId}`).toString("base64url");
  return {
    encodeCursor: encode,
    decodeCursor: (v: string) => {
      const [ts, id] = Buffer.from(v, "base64url").toString().split(":");
      return ts && id && /^\d+$/.test(ts) ? { timestamp: Number(ts), tradeId: id } : null;
    },
    tradeRepo: {
      findById: async (_s: string, id: string): Promise<PublicTrade | null> =>
        id === "known-1"
          ? { tradeId: "known-1", symbol: "BTCUSDC", price: "1", quantity: "1", quoteQuantity: "1", side: "BUY", isBuyerMaker: false, timestamp: 1 }
          : null,
      listHistorical: async (p: unknown) => {
        historyCalls.push(p);
        return { trades: [], nextCursor: null };
      },
      insertIfAbsent: async () => true,
      streamSince: async function* () {},
    },
  };
});

const { app } = await import("../src/app");
const { health } = await import("../src/health");
const { marketRegistry } = await import("../src/market/registry");
const state = await import("../src/market/state");
const { OrderBookStore } = await import("../src/store/orderbook");

let server: Server;
let base = "";

const MARKET = {
  marketId: "m1",
  symbol: "BTCUSDC",
  baseAsset: "BTC",
  quoteAsset: "USDC",
  status: "TRADING",
  tickSize: "0.01",
  stepSize: "0.000001",
  minPrice: "0.01",
  maxPrice: "1000000",
  minQuantity: "0.000001",
  maxQuantity: "1000",
  minNotional: "5",
  makerFee: "0.001",
  takerFee: "0.001",
  pricePrecision: 2,
  quantityPrecision: 6,
};

async function get(path: string) {
  const res = await fetch(base + path);
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  return { status: res.status, body: body as any };
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  storedCandles = [];
  historyCalls = [];
  dbFails = false;
  state.orderBookStore.clear();
  state.tickerStore.clear();
  state.tickerAggregator.clear();
  state.candleAggregator.clear();
  state.recentTradesStore.clear();
  marketRegistry.set([MARKET]);
  health.setPhase("ready");
});

describe("readiness gate", () => {
  test("liveness is always 200; data routes are 503 until ready", async () => {
    health.setPhase("starting");
    expect((await get("/health/live")).status).toBe(200);
    expect((await get("/health/ready")).status).toBe(503);
    const r = await get("/markets");
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ success: false, data: null });
  });

  test("ready reports 200 and metrics render as Prometheus text", async () => {
    expect((await get("/health/ready")).status).toBe(200);
    const m = await get("/metrics");
    expect(m.status).toBe(200);
    expect(typeof m.body).toBe("string");
  });
});

describe("markets", () => {
  test("lists served markets and resolves symbols case-insensitively", async () => {
    expect((await get("/markets")).body.data).toEqual([MARKET]);
    expect((await get("/markets/btcusdc")).body.data.symbol).toBe("BTCUSDC");
  });

  test("400 for malformed symbols, 404 for unknown markets, 404 for unknown routes", async () => {
    expect((await get("/markets/BTC-USDC")).status).toBe(400);
    const missing = await get("/markets/DOGEUSDC/ticker");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, message: "Market not found: DOGEUSDC", statusCode: 404 });
    expect((await get("/nope")).status).toBe(404);
  });

  test("status reports DB trading status and data availability", async () => {
    const r = await get("/markets/BTCUSDC/status");
    expect(r.body.data).toMatchObject({ status: "TRADING", orderBookSequenceNumber: null });
  });
});

describe("order book", () => {
  test("503 before the book is loaded", async () => {
    expect((await get("/markets/BTCUSDC/orderbook")).status).toBe(503);
  });

  test("depth with limit, string sequence numbers and book ticker", async () => {
    state.orderBookStore.replace(
      OrderBookStore.build({
        symbol: "BTCUSDC",
        sequenceNumber: 42n,
        bids: [{ price: "99", quantity: "1" }, { price: "98", quantity: "2" }],
        asks: [{ price: "101", quantity: "3" }],
      }),
    );
    const depth = await get("/markets/BTCUSDC/orderbook?limit=1");
    expect(depth.body.data).toMatchObject({ sequenceNumber: "42", bids: [{ price: "99", quantity: "1" }] });
    expect(depth.body.data.bids).toHaveLength(1);

    const bt = await get("/markets/BTCUSDC/bookTicker");
    expect(bt.body.data).toMatchObject({ bidPrice: "99", askPrice: "101", askQuantity: "3" });
  });

  test("limit validation", async () => {
    for (const q of ["0", "501", "abc", "1.5", "-1"]) {
      expect((await get(`/markets/BTCUSDC/orderbook?limit=${q}`)).status).toBe(400);
    }
    expect((await get("/markets/BTCUSDC/orderbook?limit=1&limit=2")).status).toBe(400);
  });
});

describe("tickers and trades", () => {
  test("tickers serialise without bigint errors", async () => {
    state.tickerAggregator.register(["BTCUSDC"]);
    const all = await get("/tickers");
    expect(all.status).toBe(200);
    expect(all.body.data[0]).toMatchObject({ symbol: "BTCUSDC", lastPrice: null, sequenceNumber: "1" });

    const price = await get("/markets/BTCUSDC/price");
    expect(price.body.data.price).toBeNull();
  });

  test("recent trades come from memory, newest first", async () => {
    for (const [i, p] of ["1", "2", "3"].entries()) {
      state.recentTradesStore.addTrade({
        tradeId: `r${i}`, symbol: "BTCUSDC", price: p, quantity: "1", quoteQuantity: p, side: "SELL", isBuyerMaker: true, timestamp: 1000 + i,
      });
    }
    const r = await get("/markets/BTCUSDC/trades?limit=2");
    expect(r.body.data.map((t: PublicTrade) => t.price)).toEqual(["3", "2"]);
  });

  test("historical trades validate range and cursor", async () => {
    expect((await get("/markets/BTCUSDC/historical-trades?startTime=10&endTime=5")).status).toBe(400);
    expect((await get("/markets/BTCUSDC/historical-trades?cursor=garbage")).status).toBe(400);
    expect((await get("/markets/BTCUSDC/historical-trades?limit=1001")).status).toBe(400);
    const ok = await get("/markets/BTCUSDC/historical-trades?limit=10&startTime=1&endTime=2");
    expect(ok.status).toBe(200);
    expect(historyCalls[0]).toMatchObject({ symbol: "BTCUSDC", limit: 10, startTime: 1, endTime: 2 });
  });

  test("trade by id: 200, 404 and 400", async () => {
    expect((await get("/markets/BTCUSDC/trades/known-1")).body.data.tradeId).toBe("known-1");
    expect((await get("/markets/BTCUSDC/trades/unknown-9")).status).toBe(404);
    expect((await get("/markets/BTCUSDC/trades/bad%20id")).status).toBe(400);
  });
});

describe("candles", () => {
  test("interval is required and validated", async () => {
    expect((await get("/markets/BTCUSDC/candles")).status).toBe(400);
    expect((await get("/markets/BTCUSDC/candles?interval=2m")).status).toBe(400);
  });

  test("memory candles override persisted rows for the same openTime", async () => {
    const T = Date.UTC(2026, 9, 25, 12);
    const row = (openTime: number, close: string): Candle => ({
      symbol: "BTCUSDC", interval: "1m", openTime, closeTime: openTime + 60_000, open: "1", high: "1", low: "1",
      close, baseVolume: "1", quoteVolume: "1", tradeCount: 1, isClosed: true, updatedAt: 0,
    });
    storedCandles = [row(T - 60_000, "stored-old"), row(T, "stored-stale")];
    state.candleAggregator.processTrade(
      { tradeId: "c1", symbol: "BTCUSDC", price: "7", quantity: "1", quoteQuantity: "7", side: "BUY", isBuyerMaker: false, timestamp: T + 1 },
      T + 1,
    );

    const r = await get("/markets/BTCUSDC/candles?interval=1m&limit=10");
    expect(r.status).toBe(200);
    expect(r.body.data.map((c: Candle) => c.close)).toEqual(["stored-old", "7"]);
    expect(r.body.data[0].updatedAt).toBeUndefined();
  });

  test("database errors return a generic 500 without internal details", async () => {
    dbFails = true;
    const r = await get("/markets/BTCUSDC/candles?interval=1m");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("10.0.0.5");
    expect(r.body).toMatchObject({ success: false, message: "Internal server error" });
  });
});
