"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { marketApi, candleFrom, tradeFromStream } from "@/lib/api/market"
import type { BookLevel, Candle, CandleInterval, MarketInfo, PublicTrade, Ticker } from "@/lib/api/types"
import { DepthBook, type BookView } from "@/lib/ws/depth-book"
import { candleData, depthSnapshotData, depthUpdateData, tradeData } from "@/lib/ws/schemas"
import { getMarketStream, getServerSocketSnapshot, getSocketSnapshot, subscribeSocket, type SocketSnapshot } from "@/lib/ws"
import { loadMarkets, loadTickers, marketsStore, tickersStore, watchTickers, type LoadStatus, type MarketsState } from "@/lib/stores/market-store"

export type { LoadStatus }

/** Socket connection state, session and reconnect epoch. */
export function useConnection(): SocketSnapshot {
  return useSyncExternalStore(subscribeSocket, getSocketSnapshot, getServerSocketSnapshot)
}

const SERVER_MARKETS: MarketsState = { status: "idle", markets: [], error: null }

export function useMarkets(): MarketsState & { retry: () => void } {
  const state = useSyncExternalStore(marketsStore.subscribe, marketsStore.get, () => SERVER_MARKETS)
  useEffect(() => void loadMarkets(), [])
  return { ...state, retry: () => void loadMarkets(true) }
}

export function useMarket(symbol: string | null | undefined): { market: MarketInfo | undefined; status: LoadStatus; retry: () => void } {
  const { markets, status, retry } = useMarkets()
  const market = useMemo(() => markets.find((m) => m.symbol === symbol), [markets, symbol])
  return { market, status, retry }
}

const SERVER_TICKERS = { status: "idle" as LoadStatus, bySymbol: {} as Record<string, Ticker> }

/** Shared tickers (REST once, then live) for the given symbols. */
export function useTickers(symbols: string[]): { bySymbol: Record<string, Ticker>; status: LoadStatus } {
  const state = useSyncExternalStore(tickersStore.subscribe, tickersStore.get, () => SERVER_TICKERS)
  const { epoch } = useConnection()
  const key = symbols.join(",")

  // Reload after reconnects: tickers are volatile and may have dropped.
  useEffect(() => void loadTickers(), [epoch])
  useEffect(() => {
    if (!key) return
    return watchTickers(key.split(","))
  }, [key])

  return state
}

export function useTicker(symbol: string | null | undefined): Ticker | undefined {
  const symbols = useMemo(() => (symbol ? [symbol] : []), [symbol])
  return useTickers(symbols).bySymbol[symbol ?? ""]
}

// ─── Order book ───────────────────────────────────────────────────────

const WAITING: BookView = { status: "waiting", sequenceNumber: null, bids: [], asks: [] }

/**
 * Live depth with snapshot → delta → gap → resync. Renders at most once per
 * animation frame however fast deltas arrive.
 */
export function useOrderBook(symbol: string | null | undefined): BookView {
  const [tagged, setTagged] = useState<{ symbol: string | null; view: BookView }>({ symbol: null, view: WAITING })

  useEffect(() => {
    if (!symbol) return
    const stream = getMarketStream()
    const sub = { channel: "depth" as const, symbol }
    const book = new DepthBook()
    let frame: number | null = null
    const publish = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setTagged({ symbol, view: book.view() })
      })
    }

    const off = stream.subscribe(sub, (m) => {
      if (m.type === "disconnected" || m.type === "resync") {
        book.markResyncing()
        return publish()
      }
      if (m.type === "subscribe_error") return
      if (m.type === "snapshot") {
        const d = depthSnapshotData.safeParse(m.data)
        if (!d.success) return
        book.snapshot(m.sequenceNumber ?? d.data.sequenceNumber ?? null, d.data.bids, d.data.asks)
        return publish()
      }
      const d = depthUpdateData.safeParse(m.data)
      if (!d.success) return
      const result = book.update(m.sequenceNumber, m.prevSequenceNumber, d.data.bids, d.data.asks)
      if (result === "gap") stream.resync(sub)
      if (result === "applied" || result === "gap") publish()
    })
    return () => {
      off()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [symbol])

  return tagged.symbol === symbol ? tagged.view : WAITING
}

/** Best bid/ask from a book view. */
export function bestLevels(view: BookView): { bid: BookLevel | undefined; ask: BookLevel | undefined } {
  return { bid: view.bids[0], ask: view.asks[0] }
}

// ─── Recent public trades ─────────────────────────────────────────────

export function mergeTrades(prev: PublicTrade[], incoming: PublicTrade[], limit: number): PublicTrade[] {
  const byId = new Map(prev.map((t) => [t.tradeId, t]))
  for (const t of incoming) byId.set(t.tradeId, t)
  return [...byId.values()].sort((a, b) => b.executedAt - a.executedAt || (a.tradeId < b.tradeId ? 1 : -1)).slice(0, limit)
}

export function useRecentTrades(symbol: string | null | undefined, limit = 50): { trades: PublicTrade[]; status: LoadStatus } {
  const [tagged, setTagged] = useState<{ symbol: string | null; trades: PublicTrade[]; status: LoadStatus }>({ symbol: null, trades: [], status: "loading" })

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    const merge = (incoming: PublicTrade[], status?: LoadStatus) =>
      setTagged((p) => {
        const prev = p.symbol === symbol ? p : { symbol, trades: [], status: "loading" as LoadStatus }
        return { symbol, trades: mergeTrades(prev.trades, incoming, limit), status: status ?? prev.status }
      })

    marketApi
      .trades(symbol, limit)
      .then((rows) => !cancelled && merge(rows, "ready"))
      .catch(() => !cancelled && setTagged((p) => ({ symbol, trades: p.symbol === symbol ? p.trades : [], status: p.symbol === symbol && p.trades.length ? "ready" : "error" })))

    const off = getMarketStream().subscribe({ channel: "trades", symbol }, (m) => {
      if (m.type === "snapshot" && Array.isArray(m.data)) {
        merge(m.data.flatMap((t) => (tradeData.safeParse(t).success ? [tradeFromStream(t as Record<string, unknown>)] : [])), "ready")
      } else if (m.type === "update") {
        const t = tradeData.safeParse(m.data)
        if (t.success) merge([tradeFromStream(t.data)], "ready")
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [symbol, limit])

  return tagged.symbol === symbol ? tagged : { trades: [], status: "loading" }
}

// ─── Candles ──────────────────────────────────────────────────────────

/** Replace by openTime; a candle never regresses to fewer trades. */
export function upsertCandles(prev: Candle[], incoming: Candle[], limit: number): Candle[] {
  const byTime = new Map(prev.map((c) => [c.openTime, c]))
  for (const c of incoming) {
    const cur = byTime.get(c.openTime)
    if (!cur || cur.tradeCount <= c.tradeCount || (c.isClosed && !cur.isClosed)) byTime.set(c.openTime, c)
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit)
}

export function useCandles(symbol: string | null | undefined, interval: CandleInterval, limit = 300): { candles: Candle[]; status: LoadStatus; error: string | null } {
  const tag = `${symbol}:${interval}`
  const [tagged, setTagged] = useState<{ tag: string; candles: Candle[]; status: LoadStatus; error: string | null }>({ tag: "", candles: [], status: "loading", error: null })
  const { epoch } = useConnection()

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    const current = `${symbol}:${interval}`
    const upsert = (incoming: Candle[], status?: LoadStatus) =>
      setTagged((p) => {
        const prev = p.tag === current ? p : { tag: current, candles: [], status: "loading" as LoadStatus, error: null }
        return { ...prev, candles: upsertCandles(prev.candles, incoming, limit), status: status ?? prev.status }
      })

    // History over HTTP; on reconnect too, since closed candles are not replayed.
    marketApi
      .candles(symbol, interval, { limit })
      .then((rows) => {
        if (cancelled) return
        upsert(rows, "ready")
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setTagged((p) => (p.tag === current && p.candles.length ? p : { tag: current, candles: [], status: "error", error: err instanceof Error ? err.message : "Failed to load candles" }))
      })

    const off = getMarketStream().subscribe({ channel: "candles", symbol, interval }, (m) => {
      if ((m.type === "snapshot" || m.type === "update") && m.data) {
        const c = candleData.safeParse(m.data)
        if (c.success) upsert([candleFrom(c.data)])
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [symbol, interval, limit, epoch])

  return tagged.tag === tag ? tagged : { candles: [], status: "loading", error: null }
}
