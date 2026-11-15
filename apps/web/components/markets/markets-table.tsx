"use client"

import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon, StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AssetIcon, PriceChange, Sparkline, StatusBadge } from "@/components/common/market-ui"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useMarkets, useTickers } from "@/hooks/use-market-data"
import { marketApi } from "@/lib/api/market"
import type { MarketInfo, Ticker } from "@/lib/api/types"
import { formatAmount, formatCompact } from "@/lib/format"
import { DEFAULT_PREFERENCES, preferencesStore, toggleFavorite } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"

type SortKey = "symbol" | "price" | "change" | "volume"

export interface MarketRow {
  market: MarketInfo
  ticker: Ticker | undefined
}

const num = (v: string | null | undefined) => (v === null || v === undefined ? Number.NEGATIVE_INFINITY : Number(v))

/** 24 hourly closes per symbol for display-only sparklines. */
function useSparklines(symbols: string[], enabled: boolean): Record<string, number[]> {
  const [lines, setLines] = useState<Record<string, number[]>>({})
  const key = symbols.join(",")
  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    Promise.all(
      key.split(",").map((s) =>
        marketApi
          .candles(s, "1h", { limit: 24 })
          .then((c) => [s, c.map((x) => Number(x.close))] as const)
          .catch(() => [s, [] as number[]] as const),
      ),
    ).then((rows) => !cancelled && setLines(Object.fromEntries(rows)))
    return () => {
      cancelled = true
    }
  }, [key, enabled])
  return lines
}

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k
  const Icon = !active ? ChevronsUpDownIcon : sort.desc ? ArrowDownIcon : ArrowUpIcon
  return (
    <TableHead className={className} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 text-xs hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
        <Icon aria-hidden="true" className="size-3" />
      </button>
    </TableHead>
  )
}

export function MarketsTable({ variant = "full", limit }: { variant?: "full" | "compact"; limit?: number }) {
  const router = useRouter()
  const { markets, status, error, retry } = useMarkets()
  const symbols = useMemo(() => markets.map((m) => m.symbol), [markets])
  const { bySymbol } = useTickers(symbols)
  const favorites = useSyncExternalStore(preferencesStore.subscribe, () => preferencesStore.get().favorites, () => DEFAULT_PREFERENCES.favorites)
  const sparks = useSparklines(symbols, variant === "full")
  const [query, setQuery] = useState("")
  const [quote, setQuote] = useState<string>("all")
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "volume", desc: true })
  const deferred = useDeferredValue(query.trim().toUpperCase())

  const quotes = useMemo(() => [...new Set(markets.map((m) => m.quoteAsset))], [markets])

  const rows = useMemo(() => {
    const list: MarketRow[] = markets
      .filter((m) => (quote === "favorites" ? favorites.includes(m.symbol) : quote === "all" || m.quoteAsset === quote))
      .filter((m) => !deferred || m.symbol.includes(deferred.replace(/[-_/]/g, "")) || m.baseAsset.includes(deferred))
      .map((m) => ({ market: m, ticker: bySymbol[m.symbol] }))
    const val = (r: MarketRow): number | string => {
      switch (sort.key) {
        case "symbol":
          return r.market.symbol
        case "price":
          return num(r.ticker?.lastPrice)
        case "change":
          return num(r.ticker?.priceChangePercent)
        case "volume":
          return num(r.ticker?.quoteVolume)
      }
    }
    list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)
      return sort.desc ? -c : c
    })
    return limit ? list.slice(0, limit) : list
  }, [markets, bySymbol, deferred, quote, favorites, sort, limit])

  const onSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "symbol" }))

  if (status === "error") return <ErrorState title="Markets are unavailable" message={error} onRetry={retry} />

  const full = variant === "full"

  return (
    <div className="flex flex-col gap-3">
      {full ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ToggleGroup type="single" size="sm" variant="outline" value={quote} onValueChange={(v) => v && setQuote(v)} aria-label="Filter markets">
            <ToggleGroupItem value="favorites" aria-label="Favourites">
              <StarIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {quotes.map((q) => (
              <ToggleGroupItem key={q} value={q}>
                {q}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <InputGroup className="sm:w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search markets" aria-label="Search markets" value={query} onChange={(e) => setQuery(e.target.value)} />
          </InputGroup>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-panel glass-edge">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {full ? <TableHead className="w-8" /> : null}
              <SortHead label="Market" k="symbol" sort={sort} onSort={onSort} />
              <SortHead label="Last price" k="price" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="24h change" k="change" sort={sort} onSort={onSort} className="text-right" />
              <TableHead className="hidden text-right text-xs md:table-cell">24h high / low</TableHead>
              <SortHead label="24h volume" k="volume" sort={sort} onSort={onSort} className="hidden text-right sm:table-cell" />
              {full ? <TableHead className="hidden text-right text-xs lg:table-cell">Last 24h</TableHead> : null}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {status !== "ready"
              ? Array.from({ length: limit ?? 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={full ? 8 : 6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map(({ market: m, ticker: t }) => {
                  const fav = favorites.includes(m.symbol)
                  return (
                    <TableRow key={m.symbol} className="cursor-pointer" onClick={() => router.push(`/trade/${m.symbol}`)}>
                      {full ? (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-pressed={fav}
                            aria-label={fav ? `Remove ${m.symbol} from favourites` : `Add ${m.symbol} to favourites`}
                            onClick={() => toggleFavorite(m.symbol)}
                          >
                            <StarIcon className={cn(fav ? "fill-primary text-primary" : "text-muted-foreground")} />
                          </Button>
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Link href={`/markets/${m.symbol}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5">
                          <AssetIcon symbol={m.baseAsset} />
                          <span className="flex flex-col">
                            <span className="font-medium">
                              {m.baseAsset}
                              <span className="text-muted-foreground">/{m.quoteAsset}</span>
                            </span>
                          </span>
                          {m.status !== "TRADING" ? <StatusBadge status={m.status} /> : null}
                        </Link>
                      </TableCell>
                      <TableCell className="num text-right font-medium">{formatAmount(t?.lastPrice, m.pricePrecision)}</TableCell>
                      <TableCell className="text-right">
                        <PriceChange value={t?.priceChangePercent} />
                      </TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground md:table-cell">
                        {formatAmount(t?.highPrice, m.pricePrecision)} / {formatAmount(t?.lowPrice, m.pricePrecision)}
                      </TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">
                        {t ? `${formatCompact(t.quoteVolume)} ${m.quoteAsset}` : "—"}
                      </TableCell>
                      {full ? (
                        <TableCell className="hidden text-right lg:table-cell">
                          <Sparkline points={sparks[m.symbol] ?? []} className="ml-auto" />
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/trade/${m.symbol}`}>Trade</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
          </TableBody>
        </Table>
        {status === "ready" && rows.length === 0 ? (
          <EmptyState title={markets.length === 0 ? "No markets listed" : quote === "favorites" ? "No favourites yet" : "No matching markets"} description={quote === "favorites" ? "Star a market to pin it here. Favourites are saved in this browser." : undefined} />
        ) : null}
      </div>
    </div>
  )
}
