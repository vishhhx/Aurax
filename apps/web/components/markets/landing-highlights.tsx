"use client"

import { useMemo } from "react"
import * as D from "@/lib/decimal"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarkets } from "@/hooks/use-market-data"
import { formatFeeRate } from "@/lib/format"

/** Facts derived from the live market list — no marketing numbers. */
export function LandingHighlights() {
  const { markets, status } = useMarkets()
  const stats = useMemo(() => {
    if (markets.length === 0) return null
    const maker = markets.map((m) => m.makerFee).reduce((a, b) => D.min(a, b))
    const taker = markets.map((m) => m.takerFee).reduce((a, b) => D.min(a, b))
    return [
      { label: "Spot markets", value: String(markets.length) },
      { label: "Maker fee from", value: formatFeeRate(maker) },
      { label: "Taker fee from", value: formatFeeRate(taker) },
    ]
  }, [markets])

  if (status === "error") return null
  if (status !== "ready") return <Skeleton className="h-12 w-80" />
  if (!stats) return null
  return (
    <dl className="flex gap-8">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{s.label}</dt>
          <dd className="num text-lg font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}
