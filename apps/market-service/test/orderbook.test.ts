import { describe, expect, test } from "bun:test";
import { OrderBookStore } from "../src/store/orderbook";
import { OrderBookSync, type RawBookSnapshot } from "../src/processors/orderbook-sync";
import { InvalidEventError } from "../src/lib/errors";
import type { MarketEvent } from "../src/types/events";

const L = (price: string, quantity: string) => ({ price, quantity });

function snap(seq: number, bids = [L("99", "1")], asks = [L("101", "1")]) {
  return OrderBookStore.build({ symbol: "BTCUSDC", sequenceNumber: BigInt(seq), bids, asks });
}

describe("OrderBookStore", () => {
  test("sorts bids descending and asks ascending using exact decimals", () => {
    const s = OrderBookStore.build({
      symbol: "BTCUSDC",
      sequenceNumber: 1n,
      bids: [L("9.5", "1"), L("10", "1"), L("9.75", "1")],
      asks: [L("12", "1"), L("10.5", "1"), L("11", "1")],
    });
    expect(s.bids.map((l) => l.price)).toEqual(["10", "9.75", "9.5"]);
    expect(s.asks.map((l) => l.price)).toEqual(["10.5", "11", "12"]);
  });

  test("rejects crossed books and duplicate levels", () => {
    expect(() => snap(1, [L("101", "1")], [L("100", "1")])).toThrow(/Crossed/);
    expect(() => snap(1, [L("99", "1"), L("99.0", "2")])).toThrow(/Duplicate/);
  });

  test("applies newer sequences, reports gaps, ignores redeliveries", () => {
    const store = new OrderBookStore();
    expect(store.applyKafkaSnapshot(snap(1), 10n)).toEqual({ status: "applied", gap: 0n });
    expect(store.applyKafkaSnapshot(snap(4), 11n)).toEqual({ status: "applied", gap: 2n });
    // Redelivery of an old offset with an old sequence
    expect(store.applyKafkaSnapshot(snap(1), 10n)).toEqual({ status: "stale" });
    expect(store.get("BTCUSDC")!.sequenceNumber).toBe(4n);
  });

  test("detects a sequence regression at a newer offset", () => {
    const store = new OrderBookStore();
    store.applyKafkaSnapshot(snap(50), 100n);
    expect(store.applyKafkaSnapshot(snap(3), 101n)).toEqual({ status: "regressed" });
  });

  test("gRPC-seeded book treats lower sequences as stale until an offset is known", () => {
    const store = new OrderBookStore();
    store.replace(snap(20));
    expect(store.applyKafkaSnapshot(snap(19), 5n)).toEqual({ status: "stale" });
    expect(store.applyKafkaSnapshot(snap(21), 6n).status).toBe("applied");
  });

  test("depth limit slices both sides", () => {
    const store = new OrderBookStore();
    store.replace(snap(1, [L("99", "1"), L("98", "1"), L("97", "1")], [L("101", "1"), L("102", "1")]));
    const d = store.getDepth("BTCUSDC", 2)!;
    expect(d.bids).toHaveLength(2);
    expect(d.asks).toHaveLength(2);
  });
});

describe("OrderBookSync depth publication", () => {
  type Depth = Extract<MarketEvent, { type: "depth.updated" }>;

  function setup(engineBook: RawBookSnapshot, opts: { failPublish?: number; snapshotEvery?: number } = {}) {
    const store = new OrderBookStore();
    const published: Depth[] = [];
    let failPublish = opts.failPublish ?? 0;
    let fetches = 0;
    const sync = new OrderBookSync({
      store,
      fetchSnapshot: async () => {
        fetches++;
        return engineBook;
      },
      publisher: {
        publish: async (e) => {
          if (failPublish > 0) {
            failPublish--;
            throw new Error("kafka down");
          }
          published.push(...(e as Depth[]));
        },
      },
      depthLevels: 2,
      isServed: (s) => s === "BTCUSDC",
      snapshotEvery: opts.snapshotEvery,
    });
    return { store, sync, published, fetches: () => fetches };
  }

  const event = (seq: number, bids = [L("99", "1"), L("98", "2"), L("97", "5")], asks = [L("101", "1")]) => ({
    event: "orderbook.updated" as const,
    symbol: "BTCUSDC",
    sequenceNumber: String(seq),
    bids,
    asks,
    timestamp: Date.now(),
  });

  const empty = { symbol: "BTCUSDC", sequenceNumber: "5", bids: [], asks: [] };

  test("initialise publishes a top-N snapshot; later updates publish chained deltas", async () => {
    const t = setup({ symbol: "BTCUSDC", sequenceNumber: "5", bids: [L("1e-7", "3")], asks: [] });
    await t.sync.initialize(["BTCUSDC"]);
    expect(t.store.get("BTCUSDC")!.bids[0]!.price).toBe("0.0000001");
    expect(t.published[0]).toMatchObject({
      eventId: "depth:BTCUSDC:snapshot:5",
      sequenceNumber: "5",
      data: { kind: "snapshot", depth: 2, bids: [{ price: "0.0000001", quantity: "3" }], asks: [] },
    });

    expect(await t.sync.handleKafka(event(6), 1n)).toBe("applied");
    expect(t.published[1]).toMatchObject({
      sequenceNumber: "6",
      data: {
        kind: "delta",
        prevSequenceNumber: "5",
        // top-2 only: 97 is outside the view; 1e-7 left the view
        bids: [L("99", "1"), L("98", "2"), L("0.0000001", "0")],
        asks: [L("101", "1")],
      },
    });

    expect(await t.sync.handleKafka(event(7, [L("99", "4"), L("98", "2")]), 2n)).toBe("applied");
    expect(t.published[2]!.data).toEqual({
      kind: "delta",
      depth: 2,
      prevSequenceNumber: "6",
      bids: [L("99", "4")],
      asks: [],
    });
  });

  test("stale snapshots are ignored and not published", async () => {
    const t = setup({ ...empty, sequenceNumber: "10" });
    await t.sync.initialize(["BTCUSDC"]);
    expect(await t.sync.handleKafka(event(9), 1n)).toBe("stale");
    expect(t.published).toHaveLength(1);
  });

  test("a failed publish breaks the chain so the next event is a snapshot", async () => {
    const failing = setup(empty, { failPublish: 2 });
    await failing.sync.initialize(["BTCUSDC"]); // fails (1)
    await failing.sync.handleKafka(event(6), 1n); // fails (2): no published state
    await failing.sync.handleKafka(event(7), 2n);
    expect(failing.published.map((e) => e.data.kind)).toEqual(["snapshot"]);
    expect(failing.published[0]!.sequenceNumber).toBe("7");
  });

  test("periodic and threshold snapshots", async () => {
    const t = setup(empty, { snapshotEvery: 2 });
    await t.sync.initialize(["BTCUSDC"]);
    for (let s = 6; s <= 9; s++) await t.sync.handleKafka(event(s), BigInt(s));
    expect(t.published.map((e) => e.data.kind)).toEqual(["snapshot", "delta", "delta", "snapshot", "delta"]);

    await t.sync.publishSnapshots();
    expect(t.published.at(-1)).toMatchObject({ sequenceNumber: "9", data: { kind: "snapshot" } });
  });

  test("engine restart (sequence regression) resyncs from gRPC and publishes a snapshot", async () => {
    const t = setup({ symbol: "BTCUSDC", sequenceNumber: "2", bids: [L("95", "1")], asks: [] });
    await t.sync.handleKafka(event(40), 10n);
    expect(await t.sync.handleKafka(event(1), 11n)).toBe("resynced");
    expect(t.fetches()).toBe(1);
    expect(t.store.get("BTCUSDC")!.sequenceNumber).toBe(2n);
    expect(t.published.at(-1)).toMatchObject({ sequenceNumber: "2", data: { kind: "snapshot" } });
    expect(await t.sync.handleKafka(event(3), 12n)).toBe("applied");
    expect(t.published.at(-1)).toMatchObject({ data: { kind: "delta", prevSequenceNumber: "2" } });
  });

  test("crossed books are rejected as invalid events", async () => {
    const t = setup(empty);
    await expect(t.sync.handleKafka(event(1, [L("200", "1")]), 1n)).rejects.toBeInstanceOf(InvalidEventError);
  });

  test("unknown markets are skipped", async () => {
    const t = setup(empty);
    expect(await t.sync.handleKafka({ ...event(1), symbol: "DOGEUSDC" }, 1n)).toBe("unknown_market");
  });
});
