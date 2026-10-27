import { beforeEach, describe, expect, mock, test } from "bun:test";

// Capture engine output instead of sending to Kafka.
const published: any[] = [];
mock.module("../src/producers/order", () => ({ producerRouter: async (e: unknown) => void published.push(e) }));

const { MatchingEngine, EngineMode } = await import("../src/matching-engine");
const { toEngineOrder, validateOrderCreated } = await import("../src/handlers/order.handlers");

const META = { topic: "order.events", partition: 0, offset: "0", timestamp: "0" };
let seq = 0;

function cmd(o: { id?: string; user?: string; side: "BUY" | "SELL"; price?: string; qty: string; type?: "LIMIT" | "MARKET"; tif?: "GTC" | "IOC" | "FOK"; postOnly?: boolean }) {
  seq++;
  return toEngineOrder({
    event: "order.created",
    eventId: `e${seq}`,
    orderId: o.id ?? `o${seq}`,
    userId: o.user ?? "u",
    symbol: "BTCUSDC",
    side: o.side,
    orderType: o.type ?? "LIMIT",
    timeInForce: o.tif ?? "GTC",
    price: o.price ?? null,
    quantity: o.qty,
    postOnly: o.postOnly ?? false,
    createdAt: new Date(1_700_000_000_000 + seq).toISOString(),
  });
}

function fresh() {
  const e = new MatchingEngine(["BTCUSDC"]);
  e.configureMarkets([{ symbol: "BTCUSDC", marketId: "m1", pricePrecision: 2, quantityPrecision: 6 }]);
  e.setMode(EngineMode.LIVE);
  published.length = 0;
  return e;
}

const of = (type: string) => published.filter((x) => x.event === type);

describe("matching", () => {
  beforeEach(() => {
    seq = 0;
  });

  test("resting limit order emits order.opened and a book snapshot", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "a", side: "SELL", price: "100", qty: "1" }), META);
    expect(of("order.opened")).toEqual([
      expect.objectContaining({ eventId: "opened:a", orderId: "a", price: "100", remainingQuantity: "1", executedQuantity: "0" }),
    ]);
    expect(of("orderbook.updated").at(-1)).toMatchObject({ asks: [{ price: "100", quantity: "1" }], bids: [] });
  });

  test("price-time priority: best price first, then FIFO within a level", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "s1", side: "SELL", price: "101", qty: "1" }), META);
    await e.consumeOrder(cmd({ id: "s2", side: "SELL", price: "100", qty: "1" }), META);
    await e.consumeOrder(cmd({ id: "s3", side: "SELL", price: "100", qty: "1" }), META);
    published.length = 0;
    await e.consumeOrder(cmd({ id: "b", side: "BUY", price: "101", qty: "2.5" }), META);
    expect(of("trade.executed").map((t) => [t.maker.orderId, t.price, t.quantity])).toEqual([
      ["s2", "100", "1"],
      ["s3", "100", "1"],
      ["s1", "101", "0.5"],
    ]);
  });

  test("partial fills: deterministic trade IDs, cumulative quantities and statuses", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "maker", side: "SELL", price: "100", qty: "1" }), META);
    await e.consumeOrder(cmd({ id: "t1", side: "BUY", price: "100", qty: "0.3" }), META);
    await e.consumeOrder(cmd({ id: "t2", side: "BUY", price: "100", qty: "0.1" }), META);
    await e.consumeOrder(cmd({ id: "t3", side: "BUY", price: "100", qty: "0.6" }), META);

    const trades = of("trade.executed");
    expect(trades.map((t) => t.tradeId)).toEqual(["t1-f1", "t2-f1", "t3-f1"]);
    expect(trades.map((t) => [t.maker.status, t.maker.executedQuantity, t.maker.remainingQuantity])).toEqual([
      ["PARTIALLY_FILLED", "0.3", "0.7"],
      ["PARTIALLY_FILLED", "0.4", "0.6"],
      ["FILLED", "1", "0"],
    ]);
    // No float residue (0.3 + 0.1 + 0.6 in IEEE-754 is not exactly 1)
    expect(e.getOrderBook("BTCUSDC").findOrder("maker")).toBeUndefined();
    expect(e.getFormattedBook("BTCUSDC")).toEqual({ bids: [], asks: [] });
  });

  test("taker partially filled then rests; later user cancel releases only the remainder", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "s", user: "alice", side: "SELL", price: "100", qty: "0.4" }), META);
    await e.consumeOrder(cmd({ id: "b", user: "bob", side: "BUY", price: "100", qty: "1" }), META);
    expect(of("order.opened").at(-1)).toMatchObject({ orderId: "b", executedQuantity: "0.4", remainingQuantity: "0.6" });

    published.length = 0;
    await e.cancelOrder({ event: "order.cancel_requested", orderId: "b", userId: "bob", symbol: "BTCUSDC", requestedAt: "" }, META);
    expect(of("order.cancelled")).toEqual([
      expect.objectContaining({ orderId: "b", reason: "USER_CANCELLED", executedQuantity: "0.4", remainingQuantity: "0.6" }),
    ]);
    expect(e.getFormattedBook("BTCUSDC").bids).toEqual([]);
  });

  test("cancel is rejected for unknown orders and for other users", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "x", user: "alice", side: "BUY", price: "99", qty: "1" }), META);
    await e.cancelOrder({ event: "order.cancel_requested", orderId: "x", userId: "mallory", symbol: "BTCUSDC", requestedAt: "" }, META);
    await e.cancelOrder({ event: "order.cancel_requested", orderId: "nope", userId: "alice", symbol: "BTCUSDC", requestedAt: "" }, META);
    expect(of("order.cancel_rejected").map((x) => x.reason)).toEqual(["NOT_OWNER", "NOT_OPEN"]);
    expect(e.getOrderBook("BTCUSDC").findOrder("x")).toBeDefined();
  });

  test("duplicate commands are ignored (no double add, no double fill)", async () => {
    const e = fresh();
    const maker = cmd({ id: "m", side: "SELL", price: "100", qty: "1" });
    await e.consumeOrder(maker, META);
    await e.consumeOrder({ ...maker, fills: [] }, META);
    expect(e.getFormattedBook("BTCUSDC").asks).toEqual([{ price: "100", quantity: "1" }]);
  });

  test("IOC remainder is cancelled; MARKET without liquidity is cancelled, not dropped", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "s", side: "SELL", price: "100", qty: "0.5" }), META);
    await e.consumeOrder(cmd({ id: "ioc", side: "BUY", price: "100", qty: "1", tif: "IOC" }), META);
    await e.consumeOrder(cmd({ id: "mkt", side: "SELL", qty: "1", type: "MARKET" }), META);
    expect(of("order.cancelled").map((x) => [x.orderId, x.reason, x.remainingQuantity])).toEqual([
      ["ioc", "IOC_REMAINING_QUANTITY", "0.5"],
      ["mkt", "MARKET_NO_LIQUIDITY", "1"],
    ]);
  });

  test("post-only and FOK rejections", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "s", side: "SELL", price: "100", qty: "1" }), META);
    await e.consumeOrder(cmd({ id: "po", side: "BUY", price: "100", qty: "1", postOnly: true }), META);
    await e.consumeOrder(cmd({ id: "fok", side: "BUY", price: "100", qty: "2", tif: "FOK" }), META);
    expect(of("order.rejected").map((x) => [x.orderId, x.reason])).toEqual([
      ["po", "POST_ONLY_WOULD_TAKE_LIQUIDITY"],
      ["fok", "FOK_NOT_FULLY_FILLABLE"],
    ]);
  });

  test("RECOVERY mode rebuilds state silently; replay produces the same trade IDs", async () => {
    const run = async (mode: "LIVE" | "RECOVERY") => {
      seq = 0;
      const e = fresh();
      e.setMode(mode === "LIVE" ? EngineMode.LIVE : EngineMode.RECOVERY);
      await e.consumeOrder(cmd({ id: "s", side: "SELL", price: "100", qty: "2" }), META);
      e.setMode(EngineMode.LIVE);
      await e.consumeOrder(cmd({ id: "b", side: "BUY", price: "100", qty: "1" }), META);
      return { book: e.getFormattedBook("BTCUSDC"), trades: of("trade.executed").map((t) => t.tradeId), opened: of("order.opened").length };
    };
    const live = await run("LIVE");
    const recovered = await run("RECOVERY");
    expect(recovered.book).toEqual(live.book);
    expect(recovered.trades).toEqual(live.trades);
    expect(recovered.opened).toBe(0); // the replayed resting order was not re-announced
  });

  test("snapshot round-trip restores book, sequences and duplicate protection", async () => {
    const e = fresh();
    await e.consumeOrder(cmd({ id: "s", side: "SELL", price: "100", qty: "2" }), META);
    const snap = e.getSnapshot(e.getOrderBook("BTCUSDC"), { topic: "order.events", partition: 0, offset: "41" });
    expect(snap.version).toBe(2);
    expect(snap.recentCommandIds).toContain("create:s");

    const r = fresh();
    r.getOrderBook("BTCUSDC").restoreOrders(snap.orders as any);
    r.restoreSequenceNumber("BTCUSDC", snap.sequenceNumber);
    r.restoreOrderSequenceNumber("BTCUSDC", snap.orderSequenceNumber);
    r.restoreRecentCommands("BTCUSDC", snap.recentCommandIds!);
    await r.consumeOrder(cmd({ id: "s", side: "SELL", price: "100", qty: "2" }), META); // duplicate
    expect(r.getFormattedBook("BTCUSDC").asks).toEqual([{ price: "100", quantity: "2" }]);
    expect(r.getSequenceNumber("BTCUSDC")).toBe(snap.sequenceNumber);
  });
});

describe("command validation", () => {
  test("rejects malformed commands", () => {
    const base = { orderId: "o", userId: "u", symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", timeInForce: "GTC", price: "1", quantity: "1" } as const;
    expect(validateOrderCreated(base)).toBeNull();
    expect(validateOrderCreated({ ...base, quantity: "-1" })).toBe("invalid quantity");
    expect(validateOrderCreated({ ...base, price: null })).toBe("invalid price");
    expect(validateOrderCreated({ ...base, side: "HOLD" as never })).toBe("invalid side");
    expect(validateOrderCreated({ ...base, createdAt: "yesterday" })).toBe("invalid createdAt");
  });
});
