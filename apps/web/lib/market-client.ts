"use client"

import type { Socket } from "socket.io-client"
import { api } from "@/lib/axios"

/**
 * Client side of the market-data protocol (apps/market-service/MARKET_DATA_PROTOCOL.md).
 *
 * - REST (API gateway /api/v1/market) provides initial state.
 * - The WebSocket gateway streams updates on socket event "market".
 * - `MarketStream` reference-counts subscriptions so many components share
 *   one server subscription (no duplicates), routes messages by key, and
 *   re-subscribes after every reconnect (the server then sends fresh
 *   snapshots).
 */

export type Channel = "depth" | "trades" | "ticker" | "candles"
export type Interval = "1m" | "5m" | "15m" | "1h" | "1d"

export interface Subscription {
  channel: Channel
  symbol: string
  interval?: Interval
}

export interface DepthLevel {
  price: string
  quantity: string
}

export type MarketMessage =
  | { type: "snapshot"; key: string; channel: Channel; symbol: string; sequenceNumber: string | null; data: unknown }
  | {
      type: "update"
      key: string
      channel: Channel
      symbol: string
      eventId: string
      sequenceNumber: string | null
      prevSequenceNumber?: string
      timestamp: number
      data: unknown
    }
  | { type: "resync"; key: string; channel: "depth"; symbol: string; reason: string }

export const subscriptionKey = (s: Subscription) =>
  s.channel === "candles" ? `md:candles:${s.symbol}:${s.interval}` : `md:${s.channel}:${s.symbol}`

type Listener = (message: MarketMessage) => void

class MarketStream {
  private readonly subs = new Map<string, { sub: Subscription; listeners: Set<Listener> }>()

  constructor(private readonly socket: Socket) {
    socket.on("market", (message: MarketMessage & { error?: string }) => {
      if (!message?.key) return
      const entry = this.subs.get(message.key)
      entry?.listeners.forEach((l) => l(message))
    })
    // Every (re)connect: restore all active subscriptions.
    socket.on("connect", () => {
      for (const { sub } of this.subs.values()) this.send("subscribe", sub)
    })
  }

  private send(action: "subscribe" | "unsubscribe" | "resync", sub: Subscription) {
    if (!this.socket.connected) return // replayed on connect
    this.socket.emit("market", { action, ...sub })
  }

  subscribe(sub: Subscription, listener: Listener): () => void {
    const key = subscriptionKey(sub)
    let entry = this.subs.get(key)
    if (!entry) {
      entry = { sub, listeners: new Set() }
      this.subs.set(key, entry)
      this.send("subscribe", sub)
    } else {
      // Late joiner: ask for a snapshot of the shared subscription.
      if (sub.channel === "depth") this.send("resync", sub)
    }
    entry.listeners.add(listener)

    return () => {
      const current = this.subs.get(key)
      if (!current) return
      current.listeners.delete(listener)
      if (current.listeners.size === 0) {
        this.subs.delete(key)
        this.send("unsubscribe", sub)
      }
    }
  }

  resync(sub: Subscription) {
    this.send("resync", sub)
  }
}

let stream: MarketStream | null = null
export function getMarketStream(socket: Socket): MarketStream {
  if (!stream) stream = new MarketStream(socket)
  return stream
}

// ─── REST (initial state) ─────────────────────────────────────────────

export interface MarketInfo {
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
  tickSize: string
  stepSize: string
  minNotional: string
  makerFee: string
  takerFee: string
  pricePrecision: number
  quantityPrecision: number
}

/** Normalised 24h ticker (REST and WebSocket shapes differ slightly). */
export interface TickerView {
  symbol: string
  lastPrice: string | null
  openPrice: string | null
  highPrice: string | null
  lowPrice: string | null
  priceChange: string | null
  priceChangePercent: string | null
  volume: string
  quoteVolume: string
  tradeCount: number
  timestamp: number
}

export interface TradeView {
  tradeId: string
  price: string
  quantity: string
  side: "BUY" | "SELL"
  executedAt: number
}

export interface CandleView {
  openTime: number
  open: string
  high: string
  low: string
  close: string
  baseVolume: string
  isClosed: boolean
  tradeCount: number
}

async function get<T>(path: string): Promise<T> {
  const res = await api.get(`/api/v1/market${path}`)
  return res.data.data as T
}

export const marketApi = {
  markets: () => get<MarketInfo[]>("/markets"),
  tickers: async (): Promise<TickerView[]> => {
    const rows = await get<Array<Record<string, unknown>>>("/tickers")
    return rows.map((t) => ({
      symbol: String(t.symbol),
      lastPrice: (t.lastPrice as string) ?? null,
      openPrice: (t.openPrice as string) ?? null,
      highPrice: (t.highPrice as string) ?? null,
      lowPrice: (t.lowPrice as string) ?? null,
      priceChange: (t.priceChange as string) ?? null,
      priceChangePercent: (t.priceChangePercent as string) ?? null,
      volume: String(t.volume ?? "0"),
      quoteVolume: String(t.quoteVolume ?? "0"),
      tradeCount: Number(t.tradeCount ?? 0),
      timestamp: Number(t.updatedAt ?? Date.now()),
    }))
  },
  candles: (symbol: string, interval: Interval, limit = 60) =>
    get<CandleView[]>(`/markets/${symbol}/candles?interval=${interval}&limit=${limit}`),
  trades: async (symbol: string, limit = 50): Promise<TradeView[]> => {
    const rows = await get<Array<Record<string, unknown>>>(`/markets/${symbol}/trades?limit=${limit}`)
    return rows.map((t) => ({
      tradeId: String(t.tradeId),
      price: String(t.price),
      quantity: String(t.quantity),
      side: t.side as "BUY" | "SELL",
      executedAt: Number(t.timestamp),
    }))
  },
}

export function tickerFromEvent(symbol: string, data: Record<string, unknown>, timestamp: number): TickerView {
  return {
    symbol,
    lastPrice: (data.lastPrice as string) ?? null,
    openPrice: (data.openPrice24h as string) ?? null,
    highPrice: (data.high24h as string) ?? null,
    lowPrice: (data.low24h as string) ?? null,
    priceChange: (data.priceChange24h as string) ?? null,
    priceChangePercent: (data.priceChangePercent24h as string) ?? null,
    volume: String(data.baseVolume24h ?? "0"),
    quoteVolume: String(data.quoteVolume24h ?? "0"),
    tradeCount: Number(data.tradeCount24h ?? 0),
    timestamp,
  }
}

// ─── Display formatting (presentation only; values stay strings) ──────

export function formatDecimal(value: string | null | undefined, decimals: number): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatCompactNumber(value: string | null | undefined): string {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n) : "—"
}

export function formatPercentString(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—"
}
