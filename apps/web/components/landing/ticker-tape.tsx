"use client"

import { useLandingMarkets, type MarketRow } from "@/hooks/useLandingMarkets"
import { formatDecimal } from "@/lib/market-client"
import { PriceChange } from "@/components/market/market-primitives"
import { Skeleton } from "@/components/ui/skeleton"

function TickerItem({ row }: { row: MarketRow }) {
  const { market, ticker } = row
  return (
    <li className="flex shrink-0 items-center gap-2 px-5 text-xs">
      <span className="font-semibold text-muted-foreground">
        {market.baseAsset}/{market.quoteAsset}
      </span>
      <span className="font-mono font-medium tabular-nums">
        {ticker?.lastPrice ? formatDecimal(ticker.lastPrice, market.pricePrecision) : "No trades yet"}
      </span>
      <PriceChange value={ticker?.priceChangePercent ?? null} className="text-[0.7rem]" />
    </li>
  )
}

export function TickerTape() {
  const { rows, state } = useLandingMarkets()

  return (
    <section aria-label="Live market prices" className="group relative overflow-hidden border-b bg-card/40 py-2">
      {state === "loading" ? (
        <div className="flex gap-6 px-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-40" />
          ))}
        </div>
      ) : state === "error" || rows.length === 0 ? (
        <p className="px-5 text-xs text-muted-foreground">Market data is unavailable right now.</p>
      ) : (
        <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          <ul className="flex">
            {rows.map((r) => (
              <TickerItem key={r.market.symbol} row={r} />
            ))}
          </ul>
          {/* Duplicate track makes the loop seamless; hidden from assistive tech. */}
          <ul className="flex" aria-hidden="true">
            {rows.map((r) => (
              <TickerItem key={r.market.symbol} row={r} />
            ))}
          </ul>
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent" />
    </section>
  )
}
