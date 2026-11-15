"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AssetIcon, PriceChange, StatusBadge } from "@/components/common/market-ui"
import { DetailList, PageContainer, Panel } from "@/components/common/page"
import { EmptyState, ErrorState } from "@/components/common/states"
import { ChartPanel } from "@/components/trade/chart-panel"
import { OrderBookPanel } from "@/components/trade/order-book"
import { TerminalProvider } from "@/components/trade/terminal-context"
import { useMarket, useTicker } from "@/hooks/use-market-data"
import { marketApi } from "@/lib/api/market"
import { toApiError } from "@/lib/api/client"
import type { MarketInfo, MarketStatusInfo, PublicTrade } from "@/lib/api/types"
import * as D from "@/lib/decimal"
import { formatAmount, formatCompact, formatDateTime, formatFeeRate } from "@/lib/format"
import { cn } from "@/lib/utils"

function TradeHistory({ market }: { market: MarketInfo }) {
  const [state, setState] = useState<{ trades: PublicTrade[]; cursor: string | null; status: "loading" | "ready" | "error"; error: string | null; more: boolean }>({
    trades: [],
    cursor: null,
    status: "loading",
    error: null,
    more: false,
  })

  const load = useCallback(
    (cursor: string | null) =>
      marketApi
        .historicalTrades(market.symbol, { limit: 50, cursor })
        .then((page) => setState((s) => ({ trades: cursor ? [...s.trades, ...page.trades] : page.trades, cursor: page.nextCursor, status: "ready", error: null, more: false })))
        .catch((err: unknown) => setState((s) => ({ ...s, status: s.trades.length ? "ready" : "error", error: toApiError(err).message, more: false }))),
    [market.symbol],
  )

  useEffect(() => {
    void load(null)
  }, [load])

  if (state.status === "loading") return <Skeleton className="m-4 h-40" />
  if (state.status === "error") return <ErrorState message={state.error} onRetry={() => void load(null)} />
  if (state.trades.length === 0) return <EmptyState title="No trades yet" />
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs font-normal text-muted-foreground">Time</TableHead>
            <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Price ({market.quoteAsset})</TableHead>
            <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Amount ({market.baseAsset})</TableHead>
            <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Total ({market.quoteAsset})</TableHead>
            <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Taker</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.trades.map((t) => (
            <TableRow key={t.tradeId}>
              <TableCell className="num py-1.5 text-xs text-muted-foreground">{formatDateTime(t.executedAt)}</TableCell>
              <TableCell className={cn("num py-1.5 text-right text-xs", t.side === "BUY" ? "text-up" : "text-down")}>{formatAmount(t.price, market.pricePrecision)}</TableCell>
              <TableCell className="num py-1.5 text-right text-xs">{formatAmount(t.quantity, market.quantityPrecision)}</TableCell>
              <TableCell className="num py-1.5 text-right text-xs">{formatAmount(t.quoteQuantity, market.pricePrecision)}</TableCell>
              <TableCell className="py-1.5 text-right text-xs text-muted-foreground">{t.side === "BUY" ? "Buyer" : "Seller"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {state.cursor ? (
        <div className="flex justify-center border-t py-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={state.more}
            onClick={() => {
              setState((s) => ({ ...s, more: true }))
              void load(state.cursor)
            }}
          >
            {state.more ? "Loading…" : "Load older trades"}
          </Button>
        </div>
      ) : null}
    </>
  )
}

export function MarketDetail({ symbol }: { symbol: string }) {
  const { market, status, retry } = useMarket(symbol)
  const ticker = useTicker(market?.symbol)
  const [info, setInfo] = useState<MarketStatusInfo | null>(null)

  useEffect(() => {
    if (!market) return
    let cancelled = false
    marketApi
      .status(market.symbol)
      .then((s) => !cancelled && setInfo(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [market])

  if (status === "loading" || status === "idle") {
    return (
      <PageContainer>
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }
  if (status === "error") return <ErrorState title="Market data is unavailable" onRetry={retry} className="py-24" />
  if (!market) {
    return (
      <EmptyState title="Market not found" description={`${symbol} is not listed on Aurax.`} className="py-24">
        <Button asChild variant="outline">
          <Link href="/markets">All markets</Link>
        </Button>
      </EmptyState>
    )
  }

  const p = market.pricePrecision
  return (
    <PageContainer>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <AssetIcon symbol={market.baseAsset} className="size-10 text-xs" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <span>
                {market.baseAsset}
                <span className="text-muted-foreground">/{market.quoteAsset}</span>
              </span>
              <StatusBadge status={market.status} />
            </h1>
            <p className="num flex items-baseline gap-2 text-lg">
              {formatAmount(ticker?.lastPrice, p)} <PriceChange value={ticker?.priceChangePercent} className="text-sm" />
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/trade/${market.symbol}`}>
            Trade {market.baseAsset}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      <TerminalProvider market={market}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <ChartPanel className="h-[28rem]" />
          <OrderBookPanel className="h-[28rem]" rows={10} />
        </div>
      </TerminalProvider>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="24-hour statistics" bodyClassName="p-4">
          <DetailList
            items={[
              { label: "Open", value: <span className="num">{formatAmount(ticker?.openPrice, p)}</span> },
              { label: "Change", value: <span className="num">{formatAmount(ticker?.priceChange, p, { sign: true })}</span> },
              { label: "High", value: <span className="num">{formatAmount(ticker?.highPrice, p)}</span> },
              { label: "Low", value: <span className="num">{formatAmount(ticker?.lowPrice, p)}</span> },
              { label: `Volume (${market.baseAsset})`, value: <span className="num">{ticker ? formatCompact(ticker.volume) : "—"}</span> },
              { label: `Volume (${market.quoteAsset})`, value: <span className="num">{ticker ? formatCompact(ticker.quoteVolume) : "—"}</span> },
              { label: "Trades", value: <span className="num">{ticker ? ticker.tradeCount.toLocaleString("en-US") : "—"}</span> },
              { label: "Last trade", value: <span className="num">{formatDateTime(info?.lastTradeTimestamp ?? ticker?.lastTradeTimestamp)}</span> },
            ]}
          />
        </Panel>
        <Panel title="Trading rules" bodyClassName="p-4">
          <DetailList
            items={[
              { label: "Tick size", value: <span className="num">{D.normalize(market.tickSize)} {market.quoteAsset}</span> },
              { label: "Step size", value: <span className="num">{D.normalize(market.stepSize)} {market.baseAsset}</span> },
              { label: "Price range", value: <span className="num">{D.normalize(market.minPrice)} – {D.normalize(market.maxPrice)}</span> },
              { label: "Quantity range", value: <span className="num">{D.normalize(market.minQuantity)} – {D.normalize(market.maxQuantity)}</span> },
              { label: "Minimum order value", value: <span className="num">{D.normalize(market.minNotional)} {market.quoteAsset}</span> },
              { label: "Maker / taker fee", value: <span className="num">{formatFeeRate(market.makerFee)} / {formatFeeRate(market.takerFee)}</span> },
              { label: "Order types", value: "Limit (GTC, IOC, FOK, post-only), market sell" },
              { label: "Book sequence", value: <span className="num">{info?.orderBookSequenceNumber ?? "—"}</span> },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Trade history" className="mt-4">
        <TradeHistory market={market} />
      </Panel>
    </PageContainer>
  )
}
