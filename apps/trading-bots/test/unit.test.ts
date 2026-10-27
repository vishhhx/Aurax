import { describe, expect, test } from "bun:test";
import { defaultLimits, type BotDef } from "../src/lib/config";
import type { Market, Order } from "../src/lib/http";
import { CandleSeries, OrderBook } from "../src/lib/market-state";
import { buildPlan } from "../src/lib/plan";
import { onStep, roundToStep } from "../src/lib/precision";
import { quotePlan, takerPlan, type StrategyInput } from "../src/strategies";

const BTC: Market = { symbol: "BTCUSDC", baseAsset: "BTC", quoteAsset: "USDC", status: "TRADING", tickSize: "0.01", stepSize: "0.000001", minQuantity: "0.000001", minNotional: "10", pricePrecision: 2, quantityPrecision: 6 };
const ETH: Market = { ...BTC, symbol: "ETHUSDC", baseAsset: "ETH" };
const alloc = (symbol: string, maker: number, taker = 0, liquidity = 0) => ({ symbol, roles: { maker, taker, liquidity }, budget: { base: "1", quote: "1000" }, limits: {} });

describe("plan validation", () => {
  test("rejects more than fifteen bots", () => expect(() => buildPlan(16, [alloc("BTCUSDC", 16)], [BTC])).toThrow("1–15"));
  test("accepts fifteen bots", () => expect(buildPlan(15, [alloc("BTCUSDC", 5, 5, 5)], [BTC]).bots).toHaveLength(15));
  test("rejects unknown market", () => expect(() => buildPlan(1, [alloc("DOGEUSDC", 1)], [BTC])).toThrow("unknown market"));
  test("rejects allocation mismatch", () => expect(() => buildPlan(3, [alloc("BTCUSDC", 1, 1)], [BTC])).toThrow("add up to 2"));
  test("rejects negative budgets", () => expect(() => buildPlan(1, [{ ...alloc("BTCUSDC", 1), budget: { base: "-1", quote: "1" } }], [BTC])).toThrow("invalid budget"));
  test("builds stable ids and splits per-market budgets", () => {
    const p = buildPlan(3, [alloc("BTCUSDC", 1, 1), alloc("ETHUSDC", 0, 0, 1)], [BTC, ETH]);
    expect(p.bots.map((b) => b.id)).toEqual(["btcusdc-maker-01", "btcusdc-taker-01", "ethusdc-liquidity-01"]);
    expect(p.bots[0]!.budget).toEqual({ base: "0.500000", quote: "500.00" });
    expect(p.bots[2]!.budget.quote).toBe("1000.00");
    expect(p.bots.every((b) => b.limits.dryRun)).toBe(true); // safe default
  });
});

describe("precision", () => {
  test("rounds onto tick grid exactly", () => {
    expect(roundToStep(65099.996, "0.01", "down")).toBe("65099.99");
    expect(roundToStep(0.1 + 0.2, "0.1", "nearest")).toBe("0.3");
    expect(roundToStep(0.00123456789, "0.000001", "down")).toBe("0.001234");
    expect(onStep("65000.5", "0.01")).toBe(true);
    expect(onStep("65000.505", "0.01")).toBe(false);
  });
});

describe("order book", () => {
  const L = (price: string, quantity: string) => ({ price, quantity });
  test("snapshot then chained deltas, qty 0 removes", () => {
    const b = new OrderBook();
    expect(b.usable).toBe(false);
    b.snapshot("10", [L("100", "1"), L("99", "2")], [L("101", "1")]);
    expect(b.delta("10", "11", [L("100", "0")], [L("102", "3")])).toBe("ok");
    expect(b.bestBid()?.price).toBe("99");
    expect(b.levels("asks").map((l) => l.price)).toEqual(["101", "102"]);
    expect(b.delta("9", "10", [], [])).toBe("stale");
  });
  test("detects a sequence gap and becomes unusable until a fresh snapshot", () => {
    const b = new OrderBook();
    b.snapshot("10", [L("100", "1")], []);
    expect(b.delta("12", "13", [], [])).toBe("gap");
    expect(b.status).toBe("unsynced");
    expect(b.bestBid()).toBeUndefined();
    b.snapshot("20", [], []);
    expect(b.usable).toBe(true);
    expect(b.mid()).toBeNull(); // empty book has no price
  });
  test("disconnect hides stale depth", () => {
    const b = new OrderBook();
    b.snapshot("1", [L("100", "1")], [L("101", "1")]);
    b.disconnect();
    expect(b.bestBid()).toBeUndefined();
  });
});

describe("candles", () => {
  const c = (openTime: number, close: string, isClosed = false) => ({ interval: "1m", openTime, open: "1", high: "2", low: "1", close, baseVolume: "1", isClosed });
  test("updates the current candle in place and ignores other intervals", () => {
    const s = new CandleSeries("1m", 3);
    s.upsert(c(60_000, "1.5"), "live");
    s.upsert(c(60_000, "1.8"), "live");
    s.upsert({ ...c(120_000, "9"), interval: "5m" }, "live");
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0]!.close).toBe("1.8");
  });
  test("never fabricates candles", () => {
    const s = new CandleSeries("1m");
    s.upsert(null as never, "live");
    expect(s.list()).toEqual([]);
    expect(s.source).toBe("none");
  });
});

const bot = (role: BotDef["role"], over: Partial<BotDef["limits"]> = {}): BotDef => ({ id: "x", name: "X", symbol: "BTCUSDC", baseAsset: "BTC", quoteAsset: "USDC", role, budget: { base: "1", quote: "1000" }, limits: { ...defaultLimits(role), dryRun: false, ...over }, enabled: true });
const input = (b: BotDef, over: Partial<StrategyInput> = {}): StrategyInput => ({ bot: b, market: BTC, bestBid: 100, bestAsk: 101, bestBidQty: 5, bestAskQty: 5, open: [], available: { base: 1, quote: 1000 }, holdingsBase: 1, sessionNotional: 0, ...over });
const order = (side: "BUY" | "SELL", price: string, id = price): Order => ({ orderId: id, symbol: "BTCUSDC", side, orderType: "LIMIT", price, quantity: "0.4", executedQuantity: "0", remainingQuantity: "0.4", status: "OPEN", createdAt: "" });

describe("maker strategy", () => {
  test("places passive post-only quotes that do not cross", () => {
    const p = quotePlan(input(bot("maker")));
    expect(p.places).toHaveLength(2);
    for (const o of p.places) {
      expect(o.postOnly).toBe(true);
      expect(onStep(o.price!, BTC.tickSize)).toBe(true);
      if (o.side === "BUY") expect(Number(o.price)).toBeLessThan(101);
      else expect(Number(o.price)).toBeGreaterThan(100);
    }
  });
  test("does not duplicate resting orders that are still on target", () => {
    const first = quotePlan(input(bot("maker")));
    const resting = first.places.map((o) => order(o.side, o.price!));
    const again = quotePlan(input(bot("maker"), { open: resting }));
    expect(again.places).toEqual([]);
    expect(again.cancels).toEqual([]);
  });
  test("cancels stale orders when the market moves", () => {
    const p = quotePlan(input(bot("maker"), { bestBid: 200, bestAsk: 201, open: [order("BUY", "99.8", "old")] }));
    expect(p.cancels).toEqual(["old"]);
  });
  test("respects balance and inventory limits", () => {
    const p = quotePlan(input(bot("maker", { maxInventoryBase: 1 }), { available: { base: 0, quote: 1000 } }));
    expect(p.places).toEqual([]); // cannot sell without base; buy would exceed inventory cap
  });
  test("refuses to quote without a reliable price", () => {
    const p = quotePlan(input(bot("maker"), { bestBid: undefined, bestAsk: undefined, lastPrice: null }));
    expect(p.places).toEqual([]);
    expect(p.note).toContain("no reliable price");
  });
});

describe("taker strategy", () => {
  test("submits one bounded IOC at the opposite best", () => {
    const p = takerPlan(input(bot("taker"), { holdingsBase: 0, available: { base: 0, quote: 1000 } }));
    expect(p.places).toHaveLength(1);
    expect(p.places[0]).toMatchObject({ side: "BUY", timeInForce: "IOC", orderType: "LIMIT" });
    const px = Number(p.places[0]!.price);
    expect(px).toBeGreaterThanOrEqual(101);
    expect(px).toBeLessThanOrEqual(101 * 1.0015); // bounded slippage
    expect(Number(p.places[0]!.quantity) * px).toBeLessThanOrEqual(200);
  });
  test("caps size at depth visible inside the slippage band", () => {
    const p = takerPlan(input(bot("taker", { maxOrderNotional: 1000 }), { holdingsBase: 0, available: { base: 0, quote: 5000 }, bestAskQty: 0.2, depthAskQty: 0.5 }));
    expect(Number(p.places[0]!.quantity)).toBeLessThanOrEqual(0.5);
  });
  test("stops at the session budget", () => expect(takerPlan(input(bot("taker"), { sessionNotional: 24999 })).places).toEqual([]));
  test("handles insufficient balance", () => expect(takerPlan(input(bot("taker"), { holdingsBase: 0, available: { base: 0, quote: 5 } })).note).toMatch(/insufficient|minimum/));
  test("waits while a previous order is still open (partial fill)", () => expect(takerPlan(input(bot("taker"), { open: [order("BUY", "101")] })).places).toEqual([]));
});

describe("bot screen", () => {
  const { render } = require("../src/lib/render");
  const view = (book: OrderBook, open: Order[] = [], fills: any[] = [], log: string[] = []) => ({ bot: bot("maker"), book, candles: new CandleSeries("1m"), wsConnected: true, authed: true, trading: "active", note: "", open, fills, balances: { base: "1", quote: "1", baseLocked: "0", quoteLocked: "0" }, sessionNotional: 0, log, pricePrecision: 2, qtyPrecision: 6 });
  test("frame height is constant so redraws never scroll", () => {
    const empty = new OrderBook();
    const full = new OrderBook();
    full.snapshot("1", Array.from({ length: 20 }, (_, k) => ({ price: String(100 - k), quantity: "1" })), Array.from({ length: 20 }, (_, k) => ({ price: String(101 + k), quantity: "1" })));
    const c = new CandleSeries("1m");
    for (let k = 0; k < 9; k++) c.upsert({ interval: "1m", openTime: k * 60000, open: "1", high: "1", low: "1", close: "1", baseVolume: "1" }, "live");
    const heights = [
      render(view(empty)),
      render({ ...view(full, [order("BUY", "99"), order("BUY", "98"), order("SELL", "102"), order("SELL", "103"), order("SELL", "104")], [{ side: "BUY", price: "1", quantity: "1", executedAt: 1 }, { side: "BUY", price: "1", quantity: "1", executedAt: 1 }, { side: "BUY", price: "1", quantity: "1", executedAt: 1 }, { side: "BUY", price: "1", quantity: "1", executedAt: 1 }], Array(30).fill("x")), candles: c }),
    ].map((f: string) => f.split("\n").length);
    expect(heights[0]).toBe(heights[1]);
  });
});
