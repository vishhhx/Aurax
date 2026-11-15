"use client"

import { useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useCandles } from "@/hooks/use-market-data"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/api/types"
import { DEFAULT_PREFERENCES, preferencesStore, updatePreferences } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"
import { CandlestickChartIcon } from "lucide-react"
import { useTerminal } from "./terminal-context"

const PriceChart = dynamic(() => import("./price-chart"), { ssr: false, loading: () => <Skeleton className="size-full" /> })

export function ChartPanel({ className }: { className?: string }) {
  const { market } = useTerminal()
  const interval = useSyncExternalStore(preferencesStore.subscribe, () => preferencesStore.get().chartInterval, () => DEFAULT_PREFERENCES.chartInterval)
  const { candles, status, error } = useCandles(market.symbol, interval, 500)

  return (
    <section aria-label="Price chart" className={cn("flex min-h-0 flex-col rounded-xl border bg-panel glass-edge", className)}>
      <header className="flex h-9 items-center justify-between gap-2 border-b px-2">
        <ToggleGroup type="single" size="sm" value={interval} onValueChange={(v) => v && updatePreferences({ chartInterval: v as CandleInterval })} aria-label="Candle interval">
          {CANDLE_INTERVALS.map((i) => (
            <ToggleGroupItem key={i} value={i} className="h-6 px-2 text-xs">
              {i}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>
      <div className="relative min-h-0 flex-1">
        {status === "loading" && candles.length === 0 ? (
          <Skeleton className="absolute inset-2" />
        ) : status === "error" && candles.length === 0 ? (
          <ErrorState title="Chart unavailable" message={error} className="absolute inset-0" />
        ) : candles.length === 0 ? (
          <EmptyState icon={CandlestickChartIcon} title="No trades yet" description={`Candles appear once ${market.baseAsset}/${market.quoteAsset} trades.`} className="absolute inset-0" />
        ) : (
          <PriceChart market={market} candles={candles} />
        )}
      </div>
    </section>
  )
}
