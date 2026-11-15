"use client"

import { memo, useMemo } from "react"
import * as D from "@/lib/decimal"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrderBook, useRecentTrades, useTicker } from "@/hooks/use-market-data"
import { useAppSelector } from "@/hooks/useRedux"
import { selectOpenOrders } from "@/store/slices/orders"
import type { BookLevel } from "@/lib/api/types"
import { direction, formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useTerminal } from "./terminal-context"

interface Row extends BookLevel {
  cumulative: string
}

/** The signed-in user's resting quantity per price level, keyed by normalized price, per book side. */
function useMyLevels(symbol: string): { bid: Map<string, string>; ask: Map<string, string> } {
  const open = useAppSelector(selectOpenOrders)
  return useMemo(() => {
    const bid = new Map<string, string>()
    const ask = new Map<string, string>()
    for (const o of open) {
      if (o.symbol !== symbol || o.price === null || D.isZero(o.remainingQuantity)) continue
      const side = o.side === "BUY" ? bid : ask
      const key = D.normalize(o.price)
      side.set(key, D.add(side.get(key) ?? "0", o.remainingQuantity))
    }
    return { bid, ask }
  }, [open, symbol])
}

/** Running depth from the best price outward (exact decimals). */
export function withCumulative(levels: BookLevel[], count: number): Row[] {
  let total = "0"
  return levels.slice(0, count).map((l) => {
    total = D.add(total, l.quantity)
    return { ...l, cumulative: total }
  })
}

const BookRow = memo(function BookRow({ row, side, maxDepth, p, q, mine, onPick }: { row: Row; side: "bid" | "ask"; maxDepth: number; p: number; q: number; mine?: string; onPick: (price: string) => void }) {
  const width = maxDepth > 0 ? Math.min(100, (Number(row.cumulative) / maxDepth) * 100) : 0
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(row.price)}
        title={mine ? `Your order: ${formatAmount(mine, q)}` : undefined}
        className={cn(
          "relative grid h-5 w-full grid-cols-3 items-center px-3 text-right text-xs hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none",
          mine && "bg-mine/15 hover:bg-mine/25",
        )}
        aria-label={`${side === "bid" ? "Bid" : "Ask"} ${row.price}, quantity ${row.quantity}${mine ? `, includes your order of ${mine}` : ""}. Use price`}
      >
        <span aria-hidden="true" className={cn("absolute inset-y-0 right-0", side === "bid" ? "bg-up/10" : "bg-down/10")} style={{ width: `${width}%` }} />
        {mine ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-mine" /> : null}
        <span className={cn("num relative text-left", side === "bid" ? "text-up" : "text-down")}>
          {formatAmount(row.price, p)}
          {mine ? <span aria-hidden="true" className="ml-1 inline-block size-1.5 rounded-full bg-mine align-middle" /> : null}
        </span>
        <span className="num relative">{formatAmount(row.quantity, q)}</span>
        <span className="num relative text-muted-foreground">{formatAmount(row.cumulative, q)}</span>
      </button>
    </li>
  )
})

export function OrderBookPanel({ rows = 14, className }: { rows?: number; className?: string }) {
  const { market, pickPrice } = useTerminal()
  const book = useOrderBook(market.symbol)
  const ticker = useTicker(market.symbol)
  const mine = useMyLevels(market.symbol)
  const p = market.pricePrecision
  const q = market.quantityPrecision

  const { asks, bids, maxDepth, spread, spreadPct } = useMemo(() => {
    const a = withCumulative(book.asks, rows)
    const b = withCumulative(book.bids, rows)
    const max = Math.max(Number(a[a.length - 1]?.cumulative ?? 0), Number(b[b.length - 1]?.cumulative ?? 0))
    const bestAsk = book.asks[0]?.price
    const bestBid = book.bids[0]?.price
    const s = bestAsk && bestBid ? D.sub(bestAsk, bestBid) : null
    const pct = s && bestAsk && !D.isZero(bestAsk) ? D.div(D.mul(s, "100"), bestAsk, 3) : null
    return { asks: a.reverse(), bids: b, maxDepth: max, spread: s, spreadPct: pct }
  }, [book, rows])

  const onPick = (price: string) => pickPrice(price)
  const stale = book.status !== "synced"
  const dir = direction(ticker?.priceChange)

  return (
    <section aria-label="Order book" className={cn("flex min-h-0 flex-col rounded-xl border bg-panel glass-edge", className)}>
      <header className="flex h-9 items-center justify-between border-b px-3">
        <h2 className="text-sm font-medium">Order book</h2>
        {book.status === "resyncing" ? (
          <span role="status" className="text-[11px] text-warning">
            Resyncing…
          </span>
        ) : null}
      </header>
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({market.quoteAsset})</span>
        <span>Amount ({market.baseAsset})</span>
        <span>Total</span>
      </div>
      {book.status === "waiting" ? (
        <div className="flex flex-1 flex-col gap-1 px-3 py-2" aria-busy="true">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      ) : (
        <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", stale && "pointer-events-none opacity-40")} aria-busy={stale}>
          <ol className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden" aria-label="Asks">
            {asks.length === 0 ? <li className="py-3 text-center text-xs text-muted-foreground">No asks</li> : asks.map((r) => <BookRow key={r.price} row={r} side="ask" maxDepth={maxDepth} p={p} q={q} mine={mine.ask.get(D.normalize(r.price))} onPick={onPick} />)}
          </ol>
          <div className="flex h-8 items-center justify-between border-y px-3">
            <button type="button" onClick={() => ticker?.lastPrice && pickPrice(ticker.lastPrice)} className={cn("num text-sm font-semibold", dir === "up" ? "text-up" : dir === "down" ? "text-down" : "")}>
              {formatAmount(ticker?.lastPrice, p)}
            </button>
            <span className="num text-[11px] text-muted-foreground">
              Spread {spread ? formatAmount(spread, p) : "—"}
              {spreadPct ? ` (${formatAmount(spreadPct, 3)}%)` : ""}
            </span>
          </div>
          <ol className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Bids">
            {bids.length === 0 ? <li className="py-3 text-center text-xs text-muted-foreground">No bids</li> : bids.map((r) => <BookRow key={r.price} row={r} side="bid" maxDepth={maxDepth} p={p} q={q} mine={mine.bid.get(D.normalize(r.price))} onPick={onPick} />)}
          </ol>
        </div>
      )}
    </section>
  )
}

export function RecentTradesPanel({ className }: { className?: string }) {
  const { market, pickPrice } = useTerminal()
  const { trades, status } = useRecentTrades(market.symbol, 50)
  const p = market.pricePrecision
  const q = market.quantityPrecision
  return (
    <section aria-label="Recent trades" className={cn("flex min-h-0 flex-col rounded-xl border bg-panel glass-edge", className)}>
      <header className="flex h-9 items-center border-b px-3">
        <h2 className="text-sm font-medium">Recent trades</h2>
      </header>
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({market.quoteAsset})</span>
        <span>Amount ({market.baseAsset})</span>
        <span>Time</span>
      </div>
      {status === "loading" && trades.length === 0 ? (
        <div className="flex flex-col gap-1 px-3 py-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">{status === "error" ? "Trades are unavailable right now." : "No trades yet in this market."}</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto pb-1">
          {trades.map((t) => (
            <li key={t.tradeId}>
              <button type="button" onClick={() => pickPrice(t.price)} className="grid h-5 w-full grid-cols-3 items-center px-3 text-right text-xs hover:bg-muted/60" title={`${t.side === "BUY" ? "Buyer" : "Seller"} was the taker`}>
                <span className={cn("num text-left", t.side === "BUY" ? "text-up" : "text-down")}>{formatAmount(t.price, p)}</span>
                <span className="num">{formatAmount(t.quantity, q)}</span>
                <span className="num text-muted-foreground">{new Date(t.executedAt).toLocaleTimeString("en-GB", { hour12: false })}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

