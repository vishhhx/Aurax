"use client"

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react"
import { useMarkets, useSparklines, useTickers, type LoadState } from "@/hooks/useMarketData"
import type { MarketInfo, TickerView } from "@/lib/market-client"

export interface MarketRow {
  market: MarketInfo
  ticker: TickerView | undefined
  spark: number[]
}

type LandingMarkets = { rows: MarketRow[]; state: LoadState; retry: () => void }

const LandingMarketsContext = createContext<LandingMarkets | null>(null)

/** One shared data source for every landing widget (one REST load, shared subscriptions). */
export function LandingMarketsProvider({ children }: { children: ReactNode }) {
  const value = useLandingMarketsSource()
  return createElement(LandingMarketsContext.Provider, { value }, children)
}

export function useLandingMarkets(): LandingMarkets {
  const ctx = useContext(LandingMarketsContext)
  if (!ctx) throw new Error("useLandingMarkets must be used inside LandingMarketsProvider")
  return ctx
}

/** Markets from market-service with live tickers and hourly sparklines. */
function useLandingMarketsSource(): LandingMarkets {
  const { markets, state, retry } = useMarkets()
  const symbols = useMemo(() => markets.map((m) => m.symbol), [markets])
  const { tickers } = useTickers(symbols)
  const sparks = useSparklines(symbols)

  const rows = useMemo(
    () => markets.map((market) => ({ market, ticker: tickers.get(market.symbol), spark: sparks.get(market.symbol) ?? [] })),
    [markets, tickers, sparks],
  )
  return { rows, state, retry }
}
