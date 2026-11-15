import { marketApi, tickerFromStream } from "@/lib/api/market"
import { toApiError } from "@/lib/api/client"
import type { MarketInfo, Ticker } from "@/lib/api/types"
import { getMarketStream } from "@/lib/ws"
import { tickerData } from "@/lib/ws/schemas"
import { createExternalStore } from "./external-store"

/**
 * Markets and tickers shared by every screen: one REST load, one live
 * subscription per symbol however many components show it.
 */

export type LoadStatus = "idle" | "loading" | "ready" | "error"

export interface MarketsState {
  status: LoadStatus
  markets: MarketInfo[]
  error: string | null
}

export const marketsStore = createExternalStore<MarketsState>({ status: "idle", markets: [], error: null })

let marketsRequest: Promise<void> | null = null

export function loadMarkets(force = false): Promise<void> {
  if (!force && (marketsStore.get().status === "ready" || marketsRequest)) return marketsRequest ?? Promise.resolve()
  marketsStore.set((s) => ({ ...s, status: s.status === "ready" ? "ready" : "loading", error: null }))
  marketsRequest = marketApi
    .markets()
    .then((markets) => marketsStore.set({ status: "ready", markets, error: null }))
    .catch((err: unknown) => marketsStore.set((s) => ({ ...s, status: s.markets.length ? "ready" : "error", error: toApiError(err).message })))
    .finally(() => {
      marketsRequest = null
    })
  return marketsRequest
}

// ─── Tickers ──────────────────────────────────────────────────────────

export interface TickersState {
  status: LoadStatus
  bySymbol: Record<string, Ticker>
}

export const tickersStore = createExternalStore<TickersState>({ status: "idle", bySymbol: {} })

/** Revisions only move forward: compare by the freshest timestamp each carries. */
const freshness = (t: Ticker) => Math.max(t.updatedAt, t.lastTradeTimestamp ?? 0)

export function mergeTicker(state: TickersState, t: Ticker): TickersState {
  const cur = state.bySymbol[t.symbol]
  if (cur && freshness(cur) > freshness(t)) return state
  return { ...state, status: "ready", bySymbol: { ...state.bySymbol, [t.symbol]: t } }
}

let tickersRequest: Promise<void> | null = null

export function loadTickers(): Promise<void> {
  if (tickersRequest) return tickersRequest
  tickersStore.set((s) => ({ ...s, status: s.status === "ready" ? "ready" : "loading" }))
  tickersRequest = marketApi
    .tickers()
    .then((rows) => tickersStore.set((s) => rows.reduce(mergeTicker, { ...s, status: "ready" as const })))
    .catch(() => tickersStore.set((s) => ({ ...s, status: Object.keys(s.bySymbol).length ? "ready" : "error" })))
    .finally(() => {
      tickersRequest = null
    })
  return tickersRequest
}

/** Subscribes the live ticker channel for these symbols; returns the unsubscribe. */
export function watchTickers(symbols: string[]): () => void {
  const stream = getMarketStream()
  const offs = symbols.map((symbol) =>
    stream.subscribe({ channel: "ticker", symbol }, (m) => {
      if (m.type !== "snapshot" && m.type !== "update") return
      const parsed = tickerData.safeParse(m.data)
      if (!parsed.success) return
      // Snapshots carry no timestamp; the data's last trade time orders them.
      const ts = m.type === "update" ? m.timestamp : (parsed.data.lastTradeTimestamp ?? 0)
      tickersStore.set((s) => mergeTicker(s, tickerFromStream(symbol, parsed.data, ts)))
    }),
  )
  return () => offs.forEach((off) => off())
}
