"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { ChevronDownIcon, StarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AssetIcon, PriceChange, StatusBadge } from "@/components/common/market-ui"
import { ConnectionIndicator } from "@/components/app/site-header"
import { useMarkets, useTicker, useTickers } from "@/hooks/use-market-data"
import type { MarketInfo } from "@/lib/api/types"
import { direction, formatAmount, formatCompact } from "@/lib/format"
import { DEFAULT_PREFERENCES, preferencesStore, toggleFavorite } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"

function MarketSelector({ market }: { market: MarketInfo }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { markets } = useMarkets()
  const symbols = useMemo(() => markets.map((m) => m.symbol), [markets])
  const { bySymbol } = useTickers(open ? symbols : [])
  const favorites = useSyncExternalStore(preferencesStore.subscribe, () => preferencesStore.get().favorites, () => DEFAULT_PREFERENCES.favorites)
  const ordered = useMemo(() => [...markets].sort((a, b) => Number(favorites.includes(b.symbol)) - Number(favorites.includes(a.symbol))), [markets, favorites])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2 text-base font-semibold" aria-label={`Market ${market.baseAsset}/${market.quoteAsset}, change market`}>
          <AssetIcon symbol={market.baseAsset} className="size-7" />
          <span>
            {market.baseAsset}
            <span className="text-muted-foreground">/{market.quoteAsset}</span>
          </span>
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <Command>
          <CommandInput placeholder="Search markets" />
          <CommandList>
            <CommandEmpty>No markets found.</CommandEmpty>
            <CommandGroup>
              {ordered.map((m) => {
                const t = bySymbol[m.symbol]
                const fav = favorites.includes(m.symbol)
                return (
                  <CommandItem
                    key={m.symbol}
                    value={`${m.symbol} ${m.baseAsset} ${m.quoteAsset}`}
                    onSelect={() => {
                      setOpen(false)
                      router.push(`/trade/${m.symbol}`)
                    }}
                    className="gap-2"
                  >
                    <button
                      type="button"
                      aria-label={fav ? `Unfavourite ${m.symbol}` : `Favourite ${m.symbol}`}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(m.symbol)
                      }}
                      className="rounded p-0.5"
                    >
                      <StarIcon className={cn("size-3.5", fav ? "fill-primary text-primary" : "text-muted-foreground")} />
                    </button>
                    <span className="flex-1 font-medium">
                      {m.baseAsset}
                      <span className="text-muted-foreground">/{m.quoteAsset}</span>
                    </span>
                    <span className="num text-xs">{formatAmount(t?.lastPrice, m.pricePrecision)}</span>
                    <PriceChange value={t?.priceChangePercent} className="w-16 text-right text-xs" />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function MarketHeader({ market }: { market: MarketInfo }) {
  const t = useTicker(market.symbol)
  const p = market.pricePrecision
  const dir = direction(t?.priceChange)
  const stats: Array<{ label: string; value: React.ReactNode }> = [
    { label: "24h change", value: <span className={cn("num", dir === "up" ? "text-up" : dir === "down" ? "text-down" : "")}>{formatAmount(t?.priceChange, p, { sign: true })} <PriceChange value={t?.priceChangePercent} /></span> },
    { label: "24h high", value: <span className="num">{formatAmount(t?.highPrice, p)}</span> },
    { label: "24h low", value: <span className="num">{formatAmount(t?.lowPrice, p)}</span> },
    { label: `24h volume (${market.baseAsset})`, value: <span className="num">{t ? formatCompact(t.volume) : "—"}</span> },
    { label: `24h volume (${market.quoteAsset})`, value: <span className="num">{t ? formatCompact(t.quoteVolume) : "—"}</span> },
  ]

  return (
    <div className="flex items-center gap-4 overflow-x-auto rounded-xl border bg-panel glass-edge px-2 py-1.5 sm:gap-6">
      <MarketSelector market={market} />
      <div className="flex shrink-0 flex-col">
        <span className={cn("num text-lg leading-tight font-semibold", dir === "up" ? "text-up" : dir === "down" ? "text-down" : "")} aria-live="off">
          {formatAmount(t?.lastPrice, p)}
        </span>
        <span className="text-[11px] text-muted-foreground">Last price</span>
      </div>
      <dl className="flex shrink-0 items-center gap-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col whitespace-nowrap">
            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
            <dd className="text-xs">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="ml-auto flex shrink-0 items-center gap-3 pr-2">
        {market.status !== "TRADING" ? <StatusBadge status={market.status} /> : null}
        <ConnectionIndicator withLabel />
      </div>
    </div>
  )
}
