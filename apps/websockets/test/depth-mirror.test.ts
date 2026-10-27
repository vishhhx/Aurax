import { describe, expect, test } from "bun:test";
import { DepthMirror } from "../src/market/depth-mirror";
import { depthDelta, depthSnapshot, L } from "./fixtures";

describe("DepthMirror sequence consistency", () => {
  test("correctly ordered deltas apply on top of the snapshot", () => {
    const m = new DepthMirror("BTCUSDC");
    expect(m.handleKafka(depthSnapshot(5, [L("99", "1"), L("98", "2")]), 1n).kind).toBe("snapshot");
    expect(m.handleKafka(depthDelta(5, 6, [L("99", "3"), L("98", "0"), L("97", "4")]), 2n)).toMatchObject({
      kind: "delta",
      delta: { sequenceNumber: "6", prevSequenceNumber: "5" },
    });
    expect(m.state()).toEqual({
      sequenceNumber: "6",
      depth: 10,
      bids: [L("99", "3"), L("97", "4")],
      asks: [L("101", "1")],
    });
  });

  test("bid/ask ordering is exact for decimal prices", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthSnapshot(1, [L("9.5", "1"), L("10", "1"), L("9.75", "1")], [L("100.5", "1"), L("100.25", "1")]), 1n);
    const s = m.state()!;
    expect(s.bids.map((l) => l.price)).toEqual(["10", "9.75", "9.5"]);
    expect(s.asks.map((l) => l.price)).toEqual(["100.25", "100.5"]);
  });

  test("redelivered and out-of-order old deltas are ignored", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthSnapshot(5), 1n);
    m.handleKafka(depthDelta(5, 6, [L("99", "9")]), 2n);
    expect(m.handleKafka(depthDelta(5, 6, [L("99", "9")]), 2n).kind).toBe("duplicate");
    expect(m.handleKafka(depthDelta(4, 5, [L("1", "1")]), 3n).kind).toBe("duplicate");
    expect(m.state()!.sequenceNumber).toBe("6");
  });

  test("a sequence gap is detected and the mirror stops serving state", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthSnapshot(5), 1n);
    expect(m.handleKafka(depthDelta(7, 8), 2n)).toEqual({ kind: "gap", expected: "5", got: "7" });
    expect(m.isSynced).toBe(false);
    expect(m.state()).toBeNull();
    expect(m.handleKafka(depthDelta(8, 9), 3n).kind).toBe("buffered");
  });

  test("REST resync reconciles with deltas buffered while the request was in flight", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthSnapshot(5), 1n);
    m.handleKafka(depthDelta(7, 8, [L("98", "1")]), 2n); // gap
    m.handleKafka(depthDelta(8, 9, [L("97", "1")]), 3n);
    m.handleKafka(depthDelta(9, 10, [L("96", "1")]), 4n);

    // Authoritative snapshot is at 9 (already includes 98 and 97)
    const state = m.installRestSnapshot("9", { depth: 10, bids: [L("99", "1"), L("98", "1"), L("97", "1")], asks: [] });
    expect(state).toMatchObject({ sequenceNumber: "10" });
    expect(state!.bids.map((l) => l.price)).toEqual(["99", "98", "97", "96"]);

    // A late delta at or below the snapshot is a duplicate; the chain continues
    expect(m.handleKafka(depthDelta(8, 9), 5n).kind).toBe("duplicate");
    expect(m.handleKafka(depthDelta(10, 11), 6n).kind).toBe("delta");
  });

  test("REST snapshot that buffered deltas do not chain onto keeps the mirror unsynced", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthDelta(20, 21), 1n); // started mid-stream
    expect(m.installRestSnapshot("15", { depth: 10, bids: [], asks: [] })).toBeNull();
    expect(m.isSynced).toBe(false);
    // The next Kafka snapshot resolves it
    expect(m.handleKafka(depthSnapshot(21), 2n).kind).toBe("snapshot");
    expect(m.isSynced).toBe(true);
  });

  test("a newer-offset snapshot with a LOWER sequence (engine restart) is accepted; a redelivered one is not", () => {
    const m = new DepthMirror("BTCUSDC");
    m.handleKafka(depthSnapshot(500), 10n);
    expect(m.handleKafka(depthSnapshot(3), 11n).kind).toBe("snapshot");
    expect(m.state()!.sequenceNumber).toBe("3");
    expect(m.handleKafka(depthSnapshot(500), 10n).kind).toBe("duplicate");
    expect(m.handleKafka(depthDelta(3, 4), 12n).kind).toBe("delta");
  });

  test("buffer is bounded", () => {
    const m = new DepthMirror("BTCUSDC");
    for (let i = 0; i < 2_100; i++) m.handleKafka(depthDelta(i, i + 1), BigInt(i));
    // after overflow, an old REST snapshot cannot be bridged; no unbounded growth
    expect(m.installRestSnapshot("0", { depth: 10, bids: [], asks: [] })).toBeNull();
  });
});
