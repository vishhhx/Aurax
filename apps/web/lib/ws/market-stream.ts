import { marketMessageSchema, type Channel, type MarketDataMessage } from "./schemas"
import type { CandleInterval } from "@/lib/api/types"

/**
 * Public market channels over socket event "market".
 *
 * - Reference-counts subscriptions: components share one server subscription.
 * - Subscriptions are not restored by the server, so every (re)connect
 *   resubscribes everything (batches of ≤ 25 per request, ≤ 50 per socket).
 * - Routes validated messages by key; replays the last snapshot of non-depth
 *   channels to late joiners (depth late joiners request a resync instead,
 *   since updates may have been applied after the snapshot).
 * - Tells listeners when the connection drops so they can mark data stale.
 */

export interface Subscription {
  channel: Channel
  symbol: string
  interval?: CandleInterval
}

export type StreamEvent =
  | MarketDataMessage
  | { type: "subscribe_error"; error: string }
  | { type: "disconnected" }

export type StreamListener = (event: StreamEvent) => void

/** The socket.io surface this module needs (keeps it testable). */
export interface MarketSocket {
  connected: boolean
  on(event: string, fn: (...args: never[]) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
}

type Ack = { ok: true; action: string; keys?: string[] } | { ok: false; error: string }

export const MAX_ITEMS_PER_REQUEST = 25
export const MAX_SUBSCRIPTIONS = 50

export const subscriptionKey = (s: Subscription) =>
  s.channel === "candles" ? `md:candles:${s.symbol}:${s.interval}` : `md:${s.channel}:${s.symbol}`

interface Entry {
  sub: Subscription
  listeners: Set<StreamListener>
  lastSnapshot: MarketDataMessage | null
}

export class MarketStream {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly socket: MarketSocket) {
    socket.on("market", ((raw: unknown) => this.onMessage(raw)) as never)
    socket.on("connect", (() => this.resubscribeAll()) as never)
    socket.on("disconnect", (() => {
      for (const e of this.entries.values()) {
        e.lastSnapshot = null
        e.listeners.forEach((l) => l({ type: "disconnected" }))
      }
    }) as never)
  }

  get size() {
    return this.entries.size
  }

  subscribe(sub: Subscription, listener: StreamListener): () => void {
    const key = subscriptionKey(sub)
    let entry = this.entries.get(key)
    if (!entry) {
      if (this.entries.size >= MAX_SUBSCRIPTIONS) {
        listener({ type: "subscribe_error", error: `Subscription limit (${MAX_SUBSCRIPTIONS}) reached` })
        return () => {}
      }
      entry = { sub, listeners: new Set(), lastSnapshot: null }
      this.entries.set(key, entry)
      entry.listeners.add(listener)
      this.send("subscribe", [sub])
    } else {
      entry.listeners.add(listener)
      if (sub.channel === "depth") this.send("resync", [sub])
      else if (entry.lastSnapshot) listener(entry.lastSnapshot)
    }

    return () => {
      const current = this.entries.get(key)
      if (!current) return
      current.listeners.delete(listener)
      if (current.listeners.size === 0) {
        this.entries.delete(key)
        this.send("unsubscribe", [sub])
      }
    }
  }

  /** Ask for a fresh depth snapshot after a sequence gap. */
  resync(sub: Subscription) {
    this.send("resync", [sub])
  }

  private resubscribeAll() {
    const subs = [...this.entries.values()].map((e) => e.sub)
    for (let i = 0; i < subs.length; i += MAX_ITEMS_PER_REQUEST) this.send("subscribe", subs.slice(i, i + MAX_ITEMS_PER_REQUEST))
  }

  private send(action: "subscribe" | "unsubscribe" | "resync", subs: Subscription[]) {
    if (!this.socket.connected || subs.length === 0) return // replayed on connect
    const payload =
      subs.length === 1
        ? { action, ...subs[0] }
        : { action, subscriptions: subs.map((s) => ({ channel: s.channel, symbol: s.symbol, ...(s.interval ? { interval: s.interval } : {}) })) }
    this.socket.emit("market", payload, (ack: Ack | undefined) => {
      if (!ack || ack.ok || action !== "subscribe") return
      for (const s of subs) {
        this.entries.get(subscriptionKey(s))?.listeners.forEach((l) => l({ type: "subscribe_error", error: ack.error }))
      }
    })
  }

  private onMessage(raw: unknown) {
    const parsed = marketMessageSchema.safeParse(raw)
    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production") console.warn("[market] dropped malformed message", parsed.error.issues[0])
      return
    }
    const m = parsed.data
    if (m.type === "error") {
      if (process.env.NODE_ENV !== "production") console.warn("[market] server error", m.error)
      return
    }
    const entry = this.entries.get(m.key)
    if (!entry) return
    if (m.type === "snapshot" && m.channel !== "depth") entry.lastSnapshot = m
    entry.listeners.forEach((l) => l(m))
  }
}
