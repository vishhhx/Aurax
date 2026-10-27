"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useSocket } from "@/context/socketProvider"
import {
  getMarketStream,
  marketApi,
  tickerFromEvent,
  type CandleView,
  type DepthLevel,
  type Interval,
  type MarketInfo,
  type MarketMessage,
  type TickerView,
  type TradeView,
} from "@/lib/market-client"

export type LoadState = "loading" | "ready" | "error"
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline"

// ─── Connection ───────────────────────────────────────────────────────

export function useConnectionState(): ConnectionState {
  const socket = useSocket()
  const [state, setState] = useState<ConnectionState>(socket.connected ? "connected" : "connecting")

  useEffect(() => {
    const onConnect = () => setState("connected")
    const onDisconnect = () => setState("reconnecting")
    const onFailed = () => setState("offline")
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.io.on("reconnect_attempt", onDisconnect)
    socket.io.on("reconnect_failed", onFailed)
    socket.on("connect_error", onDisconnect)
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.io.off("reconnect_attempt", onDisconnect)
      socket.io.off("reconnect_failed", onFailed)
      socket.off("connect_error", onDisconnect)
    }
  }, [socket])

  return state
}

// ─── Markets (shared, fetched once) ───────────────────────────────────

let marketsCache: { promise: Promise<MarketInfo[]> | null; value: MarketInfo[] | null; error: boolean } = {
  promise: null,
  value: null,
  error: false,
}
const marketsListeners = new Set<() => void>()

function loadMarkets() {
  if (!marketsCache.promise) {
    marketsCache.promise = marketApi
      .markets()
      .then((m) => {
        marketsCache = { ...marketsCache, value: m, error: false }
        return m
      })
      .catch(() => {
        marketsCache = { promise: null, value: null, error: true }
        return []
      })
      .finally(() => marketsListeners.forEach((l) => l()))
  }
}

export function useMarkets(): { markets: MarketInfo[]; state: LoadState; retry: () => void } {
  const snap = useSyncExternalStore(
    (l) => {
      marketsListeners.add(l)
      return () => marketsListeners.delete(l)
    },
    () => marketsCache,
    () => marketsCache,
  )
  useEffect(() => loadMarkets(), [])
  return {
    markets: snap.value ?? [],
    state: snap.value ? "ready" : snap.error ? "error" : "loading",
    retry: () => {
      marketsCache = { promise: null, value: null, error: false }
      marketsListeners.forEach((l) => l())
      loadMarkets()
    },
  }
}

// ─── Tickers ──────────────────────────────────────────────────────────

/** REST initial tickers + live `ticker` updates for the given symbols. */
export function useTickers(symbols: string[]): { tickers: Map<string, TickerView>; state: LoadState } {
  const socket = useSocket()
  const [tickers, setTickers] = useState<Map<string, TickerView>>(new Map())
  const [state, setState] = useState<LoadState>("loading")
  const key = symbols.join(",")

  useEffect(() => {
    let cancelled = false
    marketApi
      .tickers()
      .then((rows) => {
        if (cancelled) return
        setTickers((prev) => {
          const next = new Map(prev)
          for (const t of rows) {
            const cur = next.get(t.symbol)
            if (!cur || cur.timestamp <= t.timestamp) next.set(t.symbol, t)
          }
          return next
        })
        setState("ready")
      })
      .catch(() => !cancelled && setState("error"))
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (symbols.length === 0) return
    const stream = getMarketStream(socket)
    const offs = symbols.map((symbol) =>
      stream.subscribe({ channel: "ticker", symbol }, (m) => {
        if (m.type === "snapshot" && !m.data) return
        if (m.type !== "snapshot" && m.type !== "update") return
        const ts = m.type === "update" ? m.timestamp : Date.now()
        const view = tickerFromEvent(symbol, m.data as Record<string, unknown>, ts)
        setTickers((prev) => {
          const cur = prev.get(symbol)
          if (cur && cur.timestamp > view.timestamp) return prev // older revision
          const next = new Map(prev)
          next.set(symbol, view)
          return next
        })
        setState("ready")
      }),
    )
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, key])

  return { tickers, state }
}

// ─── Order book ───────────────────────────────────────────────────────

export interface OrderBookState {
  status: "loading" | "synced" | "resyncing"
  sequenceNumber: string | null
  bids: DepthLevel[]
  asks: DepthLevel[]
}

const byPrice = (desc: boolean) => (a: DepthLevel, b: DepthLevel) =>
  desc ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price)

/**
 * Depth with snapshot/delta reconciliation: a delta applies only on top of
 * its `prevSequenceNumber`; anything else is a gap → request a resync and
 * stop showing stale levels until the fresh snapshot arrives.
 */
const EMPTY_BOOK: OrderBookState = { status: "loading", sequenceNumber: null, bids: [], asks: [] }

export function useOrderBook(symbol: string | null): OrderBookState {
  const socket = useSocket()
  // State is tagged with its symbol, so switching markets shows "loading"
  // without a synchronous reset inside the effect.
  const [tagged, setTagged] = useState<{ symbol: string | null; book: OrderBookState }>({ symbol: null, book: EMPTY_BOOK })
  const book = tagged.symbol === symbol ? tagged.book : EMPTY_BOOK

  useEffect(() => {
    if (!symbol) return
    const setBook = (update: OrderBookState | ((b: OrderBookState) => OrderBookState)) =>
      setTagged((prev) => {
        const base = prev.symbol === symbol ? prev.book : EMPTY_BOOK
        return { symbol, book: typeof update === "function" ? update(base) : update }
      })
    const stream = getMarketStream(socket)
    const sub = { channel: "depth" as const, symbol }

    let seq: bigint | null = null
    let bids = new Map<string, string>()
    let asks = new Map<string, string>()
    const publish = (status: OrderBookState["status"]) =>
      setBook({
        status,
        sequenceNumber: seq?.toString() ?? null,
        bids: [...bids].map(([price, quantity]) => ({ price, quantity })).sort(byPrice(true)),
        asks: [...asks].map(([price, quantity]) => ({ price, quantity })).sort(byPrice(false)),
      })

    const off = stream.subscribe(sub, (m: MarketMessage) => {
      if (m.type === "resync") {
        seq = null
        setBook((b) => ({ ...b, status: "resyncing" }))
        return
      }
      if (m.type === "snapshot") {
        const d = m.data as { bids: DepthLevel[]; asks: DepthLevel[] } | null
        if (!d) return
        seq = BigInt(m.sequenceNumber ?? "0")
        bids = new Map(d.bids.map((l) => [l.price, l.quantity]))
        asks = new Map(d.asks.map((l) => [l.price, l.quantity]))
        publish("synced")
        return
      }
      if (seq === null) return // waiting for a snapshot
      const next = BigInt(m.sequenceNumber ?? "0")
      if (next <= seq) return // duplicate
      if (m.prevSequenceNumber === undefined || BigInt(m.prevSequenceNumber) !== seq) {
        seq = null
        setBook((b) => ({ ...b, status: "resyncing" }))
        stream.resync(sub)
        return
      }
      const d = m.data as { bids: DepthLevel[]; asks: DepthLevel[] }
      for (const l of d.bids) {
        if (l.quantity === "0") bids.delete(l.price)
        else bids.set(l.price, l.quantity)
      }
      for (const l of d.asks) {
        if (l.quantity === "0") asks.delete(l.price)
        else asks.set(l.price, l.quantity)
      }
      seq = next
      publish("synced")
    })
    return off
  }, [socket, symbol])

  return book
}

// ─── Recent trades ────────────────────────────────────────────────────

export function useRecentTrades(symbol: string | null, limit = 40): { trades: TradeView[]; state: LoadState } {
  const socket = useSocket()
  const [tagged, setTagged] = useState<{ symbol: string | null; trades: TradeView[]; state: LoadState }>({
    symbol: null,
    trades: [],
    state: "loading",
  })
  const trades = tagged.symbol === symbol ? tagged.trades : []
  const state: LoadState = tagged.symbol === symbol ? tagged.state : "loading"

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    const setState = (st: LoadState) => setTagged((p) => ({ symbol, trades: p.symbol === symbol ? p.trades : [], state: st }))
    const setTrades = (fn: (prev: TradeView[]) => TradeView[]) =>
      setTagged((p) => ({ symbol, state: p.symbol === symbol ? p.state : "loading", trades: fn(p.symbol === symbol ? p.trades : []) }))
    const merge = (incoming: TradeView[]) =>
      setTrades((prev) => {
        const seen = new Set(prev.map((t) => t.tradeId))
        const merged = [...incoming.filter((t) => !seen.has(t.tradeId)), ...prev]
        merged.sort((a, b) => b.executedAt - a.executedAt || (a.tradeId < b.tradeId ? 1 : -1))
        return merged.slice(0, limit)
      })

    marketApi
      .trades(symbol, limit)
      .then((rows) => {
        if (cancelled) return
        merge(rows)
        setState("ready")
      })
      .catch(() => !cancelled && setState("error"))

    const off = getMarketStream(socket).subscribe({ channel: "trades", symbol }, (m) => {
      if (m.type === "snapshot" && Array.isArray(m.data)) {
        merge(m.data as TradeView[])
        setState("ready")
      } else if (m.type === "update") {
        merge([m.data as TradeView])
        setState("ready")
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [socket, symbol, limit])

  return { trades, state }
}

// ─── Candles ──────────────────────────────────────────────────────────

export function useCandles(symbol: string | null, interval: Interval, limit = 60): { candles: CandleView[]; state: LoadState } {
  const socket = useSocket()
  const tag = `${symbol}:${interval}`
  const [tagged, setTagged] = useState<{ tag: string; candles: CandleView[]; state: LoadState }>({ tag: "", candles: [], state: "loading" })
  const candles = tagged.tag === tag ? tagged.candles : []
  const state: LoadState = tagged.tag === tag ? tagged.state : "loading"

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    const current = `${symbol}:${interval}`
    const setState = (st: LoadState) => setTagged((p) => ({ tag: current, candles: p.tag === current ? p.candles : [], state: st }))
    const setCandles = (fn: (prev: CandleView[]) => CandleView[]) =>
      setTagged((p) => ({ tag: current, state: p.tag === current ? p.state : "loading", candles: fn(p.tag === current ? p.candles : []) }))
    const upsert = (incoming: CandleView[]) =>
      setCandles((prev) => {
        const map = new Map(prev.map((c) => [c.openTime, c]))
        for (const c of incoming) {
          const cur = map.get(c.openTime)
          if (!cur || cur.tradeCount <= c.tradeCount) map.set(c.openTime, c)
        }
        return [...map.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit)
      })

    marketApi
      .candles(symbol, interval, limit)
      .then((rows) => {
        if (cancelled) return
        upsert(rows)
        setState("ready")
      })
      .catch(() => !cancelled && setState("error"))

    const off = getMarketStream(socket).subscribe({ channel: "candles", symbol, interval }, (m) => {
      if ((m.type === "snapshot" || m.type === "update") && m.data) {
        upsert([m.data as CandleView])
        setState("ready")
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [socket, symbol, interval, limit])

  return { candles, state }
}

/** Last 24 hourly closes per symbol, for sparklines (REST only). */
export function useSparklines(symbols: string[]): Map<string, number[]> {
  const [lines, setLines] = useState<Map<string, number[]>>(new Map())
  const key = symbols.join(",")
  useEffect(() => {
    let cancelled = false
    Promise.all(
      symbols.map((s) =>
        marketApi
          .candles(s, "1h", 24)
          .then((c) => [s, c.map((x) => Number(x.close))] as const)
          .catch(() => [s, [] as number[]] as const),
      ),
    ).then((rows) => !cancelled && setLines(new Map(rows)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return lines
}

export function useMarketSymbols(): string[] {
  const { markets } = useMarkets()
  return useMemo(() => markets.map((m) => m.symbol), [markets])
}
