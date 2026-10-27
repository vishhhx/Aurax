"use client"

import Link from "next/link"
import { ChevronRightIcon, FlameIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConnectionState } from "@/hooks/useMarketData"
import { useLandingMarkets, type MarketRow } from "@/hooks/useLandingMarkets"
import { formatDecimal } from "@/lib/market-client"
import { CoinBadge, PriceChange, Sparkline } from "@/components/market/market-primitives"
import { cn } from "@/lib/utils"

const ROWS = 5
const pct = (r: MarketRow) => (r.ticker?.priceChangePercent == null ? null : Number(r.ticker.priceChangePercent))

function SnapshotRow({ row }: { row: MarketRow }) {
  const { market, ticker, spark } = row
  return (
    <li className="flex items-center gap-3 py-2.5">
      <CoinBadge symbol={market.baseAsset} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {market.baseAsset}
          <span className="font-normal text-muted-foreground">/{market.quoteAsset}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{ticker?.tradeCount ? `${ticker.tradeCount} trades · 24h` : "No trades in 24h"}</p>
      </div>
      <Sparkline points={spark} width={64} height={24} className="hidden sm:block" />
      <div className="w-28 text-right">
        <p className="font-mono text-sm font-medium tabular-nums">{ticker?.lastPrice ? formatDecimal(ticker.lastPrice, market.pricePrecision) : "—"}</p>
        <PriceChange value={ticker?.priceChangePercent ?? null} className="text-xs" />
      </div>
    </li>
  )
}

function SnapshotList({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty className="py-6">
        <EmptyHeader>
          <EmptyTitle>Nothing to show yet</EmptyTitle>
          <EmptyDescription>Movers appear once markets have traded in the last 24 hours.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <ul className="flex flex-col divide-y">
      {rows.map((r) => (
        <SnapshotRow key={r.market.symbol} row={r} />
      ))}
    </ul>
  )
}

export function MarketSnapshot() {
  const { rows, state, retry } = useLandingMarkets()
  const connection = useConnectionState()

  const traded = rows.filter((r) => pct(r) !== null)
  const popular = [...rows].sort((a, b) => Number(b.ticker?.quoteVolume ?? 0) - Number(a.ticker?.quoteVolume ?? 0)).slice(0, ROWS)
  const gainers = [...traded].filter((r) => pct(r)! > 0).sort((a, b) => pct(b)! - pct(a)!).slice(0, ROWS)
  const losers = [...traded].filter((r) => pct(r)! < 0).sort((a, b) => pct(a)! - pct(b)!).slice(0, ROWS)

  const live = connection === "connected"

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <span className="relative flex size-2">
            {live ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" /> : null}
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-up" : "bg-muted-foreground")} />
          </span>
          Market snapshot
        </CardTitle>
        <CardDescription>{live ? "Live 24h statistics" : connection === "connecting" ? "Connecting…" : "Reconnecting to live data…"}</CardDescription>
      </CardHeader>
      <CardContent>
        {state === "loading" ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === "error" ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyTitle>Market data unavailable</EmptyTitle>
              <EmptyDescription>We couldn&apos;t reach the market service.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </Empty>
        ) : (
          <Tabs defaultValue="popular">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="popular" className="gap-1.5">
                <FlameIcon aria-hidden="true" className="size-3.5" />
                Popular
              </TabsTrigger>
              <TabsTrigger value="gainers" className="gap-1.5">
                <TrendingUpIcon aria-hidden="true" className="size-3.5" />
                Gainers
              </TabsTrigger>
              <TabsTrigger value="losers" className="gap-1.5">
                <TrendingDownIcon aria-hidden="true" className="size-3.5" />
                Losers
              </TabsTrigger>
            </TabsList>
            <TabsContent value="popular" className="mt-2">
              <SnapshotList rows={popular} />
            </TabsContent>
            <TabsContent value="gainers" className="mt-2">
              <SnapshotList rows={gainers} />
            </TabsContent>
            <TabsContent value="losers" className="mt-2">
              <SnapshotList rows={losers} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <Button asChild variant="ghost" className="w-full">
          <Link href="#markets">
            View all markets
            <ChevronRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
