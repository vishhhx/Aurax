"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useMarkets } from "@/hooks/use-market-data"

/** /trade → the first listed market. */
export default function TradeIndexPage() {
  const router = useRouter()
  const { markets, status, error, retry } = useMarkets()
  const first = markets.find((m) => m.status === "TRADING") ?? markets[0]

  useEffect(() => {
    if (first) router.replace(`/trade/${first.symbol}`)
  }, [first, router])

  if (status === "error") return <ErrorState title="Trading is unavailable" message={error} onRetry={retry} className="py-24" />
  if (status === "ready" && !first) return <EmptyState title="No markets listed" className="py-24" />
  return <Skeleton className="m-2 h-[70svh]" />
}
