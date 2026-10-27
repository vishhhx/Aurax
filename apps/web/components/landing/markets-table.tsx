"use client"

import { useDeferredValue, useState } from "react"
import Link from "next/link"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon, SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLandingMarkets, type MarketRow } from "@/hooks/useLandingMarkets"
import { formatCompactNumber, formatDecimal } from "@/lib/market-client"
import { CoinBadge, PriceChange, Sparkline } from "@/components/market/market-primitives"
import { cn } from "@/lib/utils"

type SortKey = "volume" | "price" | "change"
type Sort = { key: SortKey; dir: "asc" | "desc" }

const SORT_VALUE: Record<SortKey, (r: MarketRow) => number> = {
  volume: (r) => Number(r.ticker?.quoteVolume ?? 0),
  price: (r) => Number(r.ticker?.lastPrice ?? -1),
  change: (r) => Number(r.ticker?.priceChangePercent ?? -Infinity),
}

function SortableHead({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("text-right", className)}>
      <Button variant="ghost" size="xs" onClick={() => onSort(sortKey)} className={cn("-mr-2", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
        <Icon data-icon="inline-end" aria-hidden="true" />
      </Button>
    </TableHead>
  )
}

function MarketTableRow({ row }: { row: MarketRow }) {
  const { market, ticker, spark } = row
  const p = market.pricePrecision
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <CoinBadge symbol={market.baseAsset} />
          <div className="min-w-0">
            <p className="font-semibold">
              {market.baseAsset}
              <span className="font-normal text-muted-foreground">/{market.quoteAsset}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{market.status === "TRADING" ? "Trading" : market.status}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">{ticker?.lastPrice ? formatDecimal(ticker.lastPrice, p) : "—"}</TableCell>
      <TableCell className="text-right">
        <PriceChange value={ticker?.priceChangePercent ?? null} />
      </TableCell>
      <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums lg:table-cell">{formatDecimal(ticker?.highPrice, p)}</TableCell>
      <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums lg:table-cell">{formatDecimal(ticker?.lowPrice, p)}</TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
        {ticker ? `${formatCompactNumber(ticker.quoteVolume)} ${market.quoteAsset}` : "—"}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Sparkline points={spark} className="ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" variant="outline">
          <Link href={`/trade/${market.symbol}`} aria-label={`Trade ${market.baseAsset}/${market.quoteAsset}`}>
            Trade
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function MarketsTable() {
  const { rows: all, state, retry } = useLandingMarkets()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>({ key: "volume", dir: "desc" })
  const deferredQuery = useDeferredValue(query)

  const handleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }))

  const q = deferredQuery.trim().toLowerCase()
  const getValue = SORT_VALUE[sort.key]
  const rows = all
    .filter((r) => !q || r.market.symbol.toLowerCase().includes(q) || r.market.baseAsset.toLowerCase().includes(q))
    .sort((a, b) => (sort.dir === "desc" ? getValue(b) - getValue(a) : getValue(a) - getValue(b)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <InputGroup className="sm:w-64">
          <InputGroupAddon align="inline-start" className="left-3">
            <SearchIcon aria-hidden="true" className="size-4" />
          </InputGroupAddon>
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search coin" aria-label="Search markets" className="h-9 pl-9" />
        </InputGroup>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Pair</TableHead>
              <SortableHead label="Last price" sortKey="price" sort={sort} onSort={handleSort} />
              <SortableHead label="24h change" sortKey="change" sort={sort} onSort={handleSort} />
              <TableHead className="hidden text-right lg:table-cell">24h high</TableHead>
              <TableHead className="hidden text-right lg:table-cell">24h low</TableHead>
              <SortableHead label="24h volume" sortKey="volume" sort={sort} onSort={handleSort} className="hidden md:table-cell" />
              <TableHead className="hidden text-right md:table-cell">Last 24h</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state === "loading"
              ? Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((r) => <MarketTableRow key={r.market.symbol} row={r} />)}
          </TableBody>
        </Table>
        {state === "error" ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>Market data unavailable</EmptyTitle>
              <EmptyDescription>The market service could not be reached.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </Empty>
        ) : state === "ready" && rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>No markets found</EmptyTitle>
              <EmptyDescription>{q ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "No markets are listed yet."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </div>
  )
}
