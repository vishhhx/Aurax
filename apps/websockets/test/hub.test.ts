import { describe, expect, test } from "bun:test";
import { MarketHub } from "../src/market/hub";
import type { MarketMessage } from "../src/market/protocol";
import { candleEvent, depthDelta, depthSnapshot, L, tickerEvent, tradeEvent } from "./fixtures";

function setup(fetchDepthSnapshot?: ConstructorParameters<typeof MarketHub>[0]["fetchDepthSnapshot"]) {
  const roomEmits: Array<{ room: string; message: MarketMessage; volatile: boolean }> = [];
  const hub = new MarketHub({
    emitter: { toRoom: (room, message, volatile) => void roomEmits.push({ room, message, volatile }) },
    maxSubscriptionsPerSocket: 3,
    fetchDepthSnapshot,
  });
  const socket = () => {
    const rooms = new Set<string>();
    const direct: any[] = [];
    return {
      id: Math.random().toString(36),
      rooms,
      direct,
      join: (r: string) => void rooms.add(r),
      leave: (r: string) => void rooms.delete(r),
      emit: (_e: string, p: unknown) => void direct.push(p),
    };
  };
  return { hub, roomEmits, socket };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("MarketHub routing", () => {
  test("updates go only to the matching room", () => {
    const { hub, roomEmits } = setup();
    hub.handleEvent(tradeEvent("a", "BTCUSDC"), 1n);
    hub.handleEvent(tradeEvent("b", "ETHUSDC"), 2n);
    hub.handleEvent(candleEvent(60_000, 1, "BTCUSDC", "5m"), 3n);
    expect(roomEmits.map((e) => e.room)).toEqual(["md:trades:BTCUSDC", "md:trades:ETHUSDC", "md:candles:BTCUSDC:5m"]);
    expect(roomEmits.every((e) => e.volatile === false)).toBe(true);
  });

  test("duplicate events (same eventId) are delivered once", () => {
    const { hub, roomEmits } = setup();
    hub.handleEvent(tradeEvent("a"), 1n);
    hub.handleEvent(tradeEvent("a"), 1n);
    hub.handleEvent(candleEvent(0, 2), 2n);
    hub.handleEvent(candleEvent(0, 2), 2n);
    expect(roomEmits).toHaveLength(2);
  });

  test("tickers are coalesced to the latest per symbol and sent volatile", () => {
    const { hub, roomEmits } = setup();
    hub.handleEvent(tickerEvent(1, 100, "BTCUSDC", "1"), 1n);
    hub.handleEvent(tickerEvent(2, 200, "BTCUSDC", "2"), 2n);
    hub.handleEvent(tickerEvent(9, 150, "BTCUSDC", "stale"), 3n); // older timestamp
    hub.handleEvent(tickerEvent(1, 300, "ETHUSDC", "3"), 4n);
    expect(roomEmits).toHaveLength(0);
    hub.flushTickers();
    expect(roomEmits.map((e) => [e.room, (e.message as any).data.lastPrice, e.volatile])).toEqual([
      ["md:ticker:BTCUSDC", "2", true],
      ["md:ticker:ETHUSDC", "3", true],
    ]);
    hub.flushTickers();
    expect(roomEmits).toHaveLength(2);
  });

  test("depth deltas carry prev/seq; gaps emit a resync notice", () => {
    const { hub, roomEmits } = setup();
    hub.handleEvent(depthSnapshot(5), 1n);
    hub.handleEvent(depthDelta(5, 6, [L("99", "2")]), 2n);
    hub.handleEvent(depthDelta(8, 9), 3n);
    expect(roomEmits.map((e) => e.message.type)).toEqual(["snapshot", "update", "resync"]);
    expect(roomEmits[1]!.message).toMatchObject({ sequenceNumber: "6", prevSequenceNumber: "5" });
    expect(roomEmits.every((e) => !e.volatile)).toBe(true);
  });
});

describe("MarketHub subscriptions", () => {
  test("subscribe sends a snapshot first, then joins; duplicates do not re-join", () => {
    const { hub, socket } = setup();
    hub.handleEvent(depthSnapshot(5), 1n);
    const s = socket();
    expect(hub.handleRequest(s, { action: "subscribe", channel: "depth", symbol: "BTC-USDC" })).toEqual({
      ok: true,
      action: "subscribe",
      keys: ["md:depth:BTCUSDC"],
    });
    expect(s.direct[0]).toMatchObject({ type: "snapshot", sequenceNumber: "5", data: { bids: [L("99", "1")] } });
    expect(s.rooms.has("md:depth:BTCUSDC")).toBe(true);

    hub.handleRequest(s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });
    expect(s.direct).toHaveLength(1);
    expect(hub.subscriptionCount(s.id)).toBe(1);
  });

  test("unsubscribe leaves the room; disconnect releases bookkeeping", () => {
    const { hub, socket } = setup();
    const s = socket();
    hub.handleRequest(s, { action: "subscribe", channel: "trades", symbol: "BTCUSDC" });
    hub.handleRequest(s, { action: "unsubscribe", channel: "trades", symbol: "BTCUSDC" });
    expect(s.rooms.size).toBe(0);
    hub.handleRequest(s, { action: "subscribe", channel: "trades", symbol: "BTCUSDC" });
    hub.disconnect(s.id);
    expect(hub.subscriptionCount(s.id)).toBe(0);
  });

  test("per-connection limit and unknown markets", () => {
    const { hub, socket } = setup();
    hub.setKnownSymbols(["BTCUSDC", "ETHUSDC"]);
    const s = socket();
    expect(hub.handleRequest(s, { action: "subscribe", channel: "ticker", symbol: "DOGEUSDC" })).toEqual({ ok: false, error: "unknown market: DOGEUSDC" });
    for (const channel of ["ticker", "trades", "depth"]) hub.handleRequest(s, { action: "subscribe", channel, symbol: "BTCUSDC" });
    expect(hub.handleRequest(s, { action: "subscribe", channel: "ticker", symbol: "ETHUSDC" }).ok).toBe(false);
  });

  test("trades snapshot holds the newest 50", () => {
    const { hub, socket } = setup();
    for (let i = 0; i < 60; i++) hub.handleEvent(tradeEvent(`t${i}`), BigInt(i));
    const s = socket();
    hub.handleRequest(s, { action: "subscribe", channel: "trades", symbol: "BTCUSDC" });
    expect(s.direct[0].data).toHaveLength(50);
    expect(s.direct[0].data[0].tradeId).toBe("t59");
  });
});

describe("MarketHub depth resync", () => {
  test("gap → REST snapshot (buffered deltas replayed) → snapshot pushed to the room", async () => {
    let calls = 0;
    const { hub, roomEmits, socket } = setup(async () => {
      calls++;
      return { sequenceNumber: "9", depth: 10, bids: [L("99", "5")], asks: [] };
    });
    hub.handleEvent(depthSnapshot(5), 1n);
    hub.handleEvent(depthDelta(8, 9), 2n); // gap
    hub.handleEvent(depthDelta(9, 10, [L("98", "1")]), 3n); // buffered during resync
    await tick();

    expect(calls).toBe(1);
    const last = roomEmits.at(-1)!.message;
    expect(last).toMatchObject({ type: "snapshot", sequenceNumber: "10" });
    expect((last as any).data.bids).toEqual([L("99", "5"), L("98", "1")]);

    // Client-initiated resync returns the current state
    const s = socket();
    hub.handleRequest(s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });
    hub.handleRequest(s, { action: "resync", channel: "depth", symbol: "BTCUSDC" });
    expect(s.direct.map((m) => m.sequenceNumber)).toEqual(["10", "10"]);
  });

  test("subscribing before any depth is known tells the client a snapshot is pending", async () => {
    const { hub, socket, roomEmits } = setup();
    const s = socket();
    hub.handleRequest(s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });
    expect(s.direct[0]).toMatchObject({ type: "resync", reason: "awaiting_snapshot" });
    hub.handleEvent(depthSnapshot(1), 1n);
    expect(roomEmits.at(-1)!.message.type).toBe("snapshot");
  });

  test("a freshly started gateway resyncs from REST on first subscribe (no Kafka depth seen yet)", async () => {
    let calls = 0;
    const { hub, socket, roomEmits } = setup(async () => {
      calls++;
      return { sequenceNumber: "42", depth: 10, bids: [L("105", "0.25")], asks: [] };
    });
    hub.handleRequest(socket(), { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });
    await tick();
    expect(calls).toBe(1);
    expect(roomEmits.at(-1)!.message).toMatchObject({ type: "snapshot", sequenceNumber: "42" });
  });

  test("failed REST resyncs retry until a Kafka snapshot arrives", async () => {
    let calls = 0;
    const { hub, roomEmits } = setup(async () => {
      calls++;
      throw new Error("market-service down");
    });
    hub.handleEvent(depthDelta(3, 4), 1n); // mid-stream start
    await tick();
    expect(calls).toBe(1);
    hub.handleEvent(depthSnapshot(4), 2n);
    expect(roomEmits.at(-1)!.message.type).toBe("snapshot");
    hub.stop();
  });
});
