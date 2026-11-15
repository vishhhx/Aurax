"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useMarket, useTicker } from "@/hooks/use-market-data"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AccountPanel } from "./account-panel"
import { ChartPanel } from "./chart-panel"
import { MarketHeader } from "./market-header"
import { OrderBookPanel, RecentTradesPanel } from "./order-book"
import { OrderForm } from "./order-form"
import { TerminalProvider } from "./terminal-context"

/** Keeps the tab title on the live price, like most exchanges. */
function TitlePrice({ symbol, label, precision }: { symbol: string; label: string; precision: number }) {
  const t = useTicker(symbol)
  const wanted = t?.lastPrice ? `${formatAmount(t.lastPrice, precision)} · ${label} · Aurax` : `${label} · Aurax`
  useEffect(() => {
    // Next writes the metadata title after hydration; re-apply whenever <head> changes.
    const apply = () => {
      if (document.title !== wanted) document.title = wanted
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [wanted])
  return null
}

type MobileView = "chart" | "book" | "trades"

export function TradingTerminal({ symbol }: { symbol: string }) {
  const { market, status, retry } = useMarket(symbol)
  const [view, setView] = useState<MobileView>("chart")

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col gap-2 p-2" aria-busy="true" aria-label="Loading market">
        <Skeleton className="h-14" />
        <Skeleton className="h-[60svh]" />
      </div>
    )
  }
  if (status === "error") return <ErrorState title="Trading is unavailable" message="The market service could not be reached." onRetry={retry} className="py-24" />
  if (!market) {
    return (
      <EmptyState title="Market not found" description={`${symbol} is not listed on Aurax.`} className="py-24">
        <Button asChild variant="outline">
          <Link href="/markets">Browse markets</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <TerminalProvider market={market}>
      <TitlePrice symbol={market.symbol} label={`${market.baseAsset}/${market.quoteAsset}`} precision={market.pricePrecision} />
      {/*
        Desktop: chart over account tabs | book over trades (full height) | order form.
        Tablet and phone stack, with chart / book / trades behind a switch.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 p-1.5 xl:h-[calc(100svh-3.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem_19rem] xl:grid-rows-[auto_minmax(0,1fr)_minmax(12rem,16rem)]">
        <div className="min-w-0 xl:col-span-3">
          <MarketHeader market={market} />
        </div>

        <div className="xl:hidden">
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as MobileView)} className="grid w-full grid-cols-3" aria-label="Panel">
            <ToggleGroupItem value="chart" className="w-full">
              Chart
            </ToggleGroupItem>
            <ToggleGroupItem value="book" className="w-full">
              Order book
            </ToggleGroupItem>
            <ToggleGroupItem value="trades" className="w-full">
              Trades
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <ChartPanel className={cn("h-[52svh] min-h-80 xl:col-start-1 xl:row-start-2 xl:h-auto xl:min-h-0", view !== "chart" && "hidden xl:flex")} />

        <div className={cn("grid min-h-0 gap-1.5 xl:col-start-2 xl:row-span-2 xl:row-start-2 xl:grid-rows-[minmax(0,3fr)_minmax(0,2fr)]", view === "chart" && "hidden xl:grid")}>
          <OrderBookPanel rows={20} className={cn("h-[60svh] min-h-80 xl:h-auto xl:min-h-0", view === "trades" && "hidden xl:flex")} />
          <RecentTradesPanel className={cn("h-[60svh] min-h-80 xl:h-auto xl:min-h-0", view === "book" && "hidden xl:flex")} />
        </div>

        <OrderForm className="xl:col-start-3 xl:row-span-2 xl:row-start-2 xl:overflow-y-auto" />

        <AccountPanel className="min-h-64 min-w-0 xl:col-start-1 xl:row-start-3 xl:min-h-0" />
      </div>
    </TerminalProvider>
  )
}
