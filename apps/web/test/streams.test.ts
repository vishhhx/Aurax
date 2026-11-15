import { describe, expect, test } from "bun:test"
import { MarketStream, MAX_ITEMS_PER_REQUEST, type StreamEvent } from "@/lib/ws/market-stream"
import { UserStream } from "@/lib/ws/user-stream"
import { FakeSocket } from "./fixtures"

const snapshot = (channel: string, symbol: string, data: unknown, extra: Record<string, unknown> = {}) => ({
  type: "snapshot",
  key: channel === "candles" ? `md:candles:${symbol}:${extra.interval}` : `md:${channel}:${symbol}`,
  channel,
  symbol,
  sequenceNumber: "1",
  data,
  ...extra,
})

describe("MarketStream", () => {
  test("one server subscription per key, released with the last listener", () => {
    const s = new FakeSocket()
    const stream = new MarketStream(s)
    const offA = stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, () => {})
    const offB = stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, () => {})
    expect(s.payloads()).toEqual([{ action: "subscribe", channel: "ticker", symbol: "BTCUSDC" }])
    offA()
    expect(s.payloads()).toHaveLength(1)
    offB()
    expect(s.payloads()[1]).toEqual({ action: "unsubscribe", channel: "ticker", symbol: "BTCUSDC" })
    expect(stream.size).toBe(0)
  })

  test("routes validated messages by key and drops malformed ones", () => {
    const s = new FakeSocket()
    const stream = new MarketStream(s)
    const got: StreamEvent[] = []
    stream.subscribe({ channel: "trades", symbol: "BTCUSDC" }, (e) => got.push(e))
    stream.subscribe({ channel: "trades", symbol: "ETHUSDC" }, () => {
      throw new Error("wrong key")
    })
    s.fire("market", snapshot("trades", "BTCUSDC", []))
    s.fire("market", { type: "update", key: "md:trades:BTCUSDC" }) // missing fields
    s.fire("market", "garbage")
    expect(got).toHaveLength(1)
    expect(got[0]!.type).toBe("snapshot")
  })

  test("late joiners get the cached snapshot; depth late joiners trigger a resync", () => {
    const s = new FakeSocket()
    const stream = new MarketStream(s)
    stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, () => {})
    s.fire("market", snapshot("ticker", "BTCUSDC", null))
    const late: StreamEvent[] = []
    stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, (e) => late.push(e))
    expect(late.map((e) => e.type)).toEqual(["snapshot"])

    stream.subscribe({ channel: "depth", symbol: "BTCUSDC" }, () => {})
    stream.subscribe({ channel: "depth", symbol: "BTCUSDC" }, () => {})
    expect(s.payloads().at(-1)).toEqual({ action: "resync", channel: "depth", symbol: "BTCUSDC" })
  })

  test("nothing is sent while disconnected; everything is resubscribed on connect in batches", () => {
    const s = new FakeSocket()
    s.connected = false
    const stream = new MarketStream(s)
    for (let i = 0; i < 30; i++) stream.subscribe({ channel: "ticker", symbol: `M${i}USDC` }, () => {})
    stream.subscribe({ channel: "candles", symbol: "BTCUSDC", interval: "1m" }, () => {})
    expect(s.emitted).toHaveLength(0)
    s.connected = true
    s.fire("connect")
    const batches = s.payloads()
    expect(batches).toHaveLength(2)
    expect((batches[0]!.subscriptions as unknown[]).length).toBe(MAX_ITEMS_PER_REQUEST)
    expect((batches[1]!.subscriptions as unknown[]).length).toBe(6)
    expect(batches[1]!.subscriptions).toContainEqual({ channel: "candles", symbol: "BTCUSDC", interval: "1m" })
  })

  test("disconnect notifies listeners and clears cached snapshots", () => {
    const s = new FakeSocket()
    const stream = new MarketStream(s)
    const got: string[] = []
    stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, (e) => got.push(e.type))
    s.fire("market", snapshot("ticker", "BTCUSDC", null))
    s.fire("disconnect")
    expect(got).toEqual(["snapshot", "disconnected"])
    const late: string[] = []
    stream.subscribe({ channel: "ticker", symbol: "BTCUSDC" }, (e) => late.push(e.type))
    expect(late).toEqual([])
  })

  test("a failed subscribe ack reaches the listener", () => {
    const s = new FakeSocket()
    const stream = new MarketStream(s)
    const got: StreamEvent[] = []
    stream.subscribe({ channel: "depth", symbol: "NOPEUSDC" }, (e) => got.push(e))
    s.emitted[0]!.ack!({ ok: false, error: "Unknown market NOPEUSDC" })
    expect(got).toEqual([{ type: "subscribe_error", error: "Unknown market NOPEUSDC" }])
  })
})

const balance = (eventId: string, version: number) => ({
  type: "balance.updated",
  eventId,
  timestamp: 1,
  data: { assetId: "a", asset: "USDC", available: "1", locked: "0", total: "1", reason: "TRADE", referenceId: "x", version },
})

describe("UserStream", () => {
  test("deduplicates at-least-once deliveries by eventId", () => {
    const s = new FakeSocket()
    const u = new UserStream(s)
    const got: string[] = []
    u.subscribe((m) => got.push(m.eventId))
    s.fire("user", balance("e1", 1))
    s.fire("user", balance("e1", 1))
    s.fire("user", balance("e2", 2))
    expect(got).toEqual(["e1", "e2"])
  })

  test("rejects events that do not match the documented schema", () => {
    const s = new FakeSocket()
    const u = new UserStream(s)
    const got: string[] = []
    u.subscribe((m) => got.push(m.type))
    s.fire("user", { type: "balance.updated", eventId: "x", timestamp: 1, data: { available: 1 } })
    s.fire("user", { type: "made.up", eventId: "y", timestamp: 1, data: {} })
    expect(got).toEqual([])
  })

  test("the dedupe window is bounded (oldest evicted)", () => {
    const s = new FakeSocket()
    const u = new UserStream(s, 2)
    const got: string[] = []
    u.subscribe((m) => got.push(m.eventId))
    for (const id of ["a", "b", "c", "a"]) s.fire("user", balance(id, 1))
    expect(got).toEqual(["a", "b", "c", "a"])
  })
})
