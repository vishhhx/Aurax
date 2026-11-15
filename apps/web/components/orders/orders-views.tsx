"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import * as D from "@/lib/decimal"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { SideLabel, StatusBadge } from "@/components/common/market-ui"
import { DetailList, Panel } from "@/components/common/page"
import { EmptyState, ErrorState } from "@/components/common/states"
import { FillsTable, OpenOrdersTable, OrderHistoryTable } from "@/components/orders/order-tables"
import { usePagedList, useUserEvents } from "@/hooks/use-account"
import { useCancelMany, useCancelOrder, useMarketMap } from "@/hooks/use-orders"
import { useMarkets } from "@/hooks/use-market-data"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { ordersApi } from "@/lib/api/orders"
import { toApiError } from "@/lib/api/client"
import { OPEN_STATUSES, type OrderDetail } from "@/lib/api/types"
import { formatAmount, formatDateTime, reasonLabel } from "@/lib/format"
import { fetchOpenOrders } from "@/store/slices/orders"

function MarketFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { markets } = useMarkets()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 w-36 text-xs" aria-label="Filter by market">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all" className="text-xs">
            All markets
          </SelectItem>
          {markets.map((m) => (
            <SelectItem key={m.symbol} value={m.symbol} className="text-xs">
              {m.baseAsset}/{m.quoteAsset}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function Pager({ list }: { list: { hasMore: boolean; loadingMore: boolean; loadMore: () => void; error: string | null; rows: unknown[] } }) {
  if (!list.hasMore && !(list.error && list.rows.length)) return null
  return (
    <div className="flex items-center justify-center gap-3 border-t py-2">
      {list.error && list.rows.length ? <span className="text-xs text-destructive">{list.error}</span> : null}
      {list.hasMore ? (
        <Button variant="ghost" size="xs" disabled={list.loadingMore} onClick={list.loadMore}>
          {list.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}

export function OpenOrdersView() {
  const dispatch = useAppDispatch()
  const markets = useMarketMap()
  const { open, status, error, cancelling } = useAppSelector((s) => s.orders)
  const cancel = useCancelOrder()
  const cancelMany = useCancelMany()
  const [symbol, setSymbol] = useState("all")
  const [confirm, setConfirm] = useState(false)
  const rows = useMemo(() => (symbol === "all" ? open : open.filter((o) => o.symbol === symbol)), [open, symbol])
  const cancellable = rows.filter((o) => !cancelling[o.orderId])

  return (
    <Panel
      title={`Open orders (${rows.length})`}
      actions={
        <>
          <MarketFilter value={symbol} onChange={setSymbol} />
          {cancellable.length > 0 ? (
            <Button variant="outline" size="xs" onClick={() => setConfirm(true)}>
              Cancel all
            </Button>
          ) : null}
        </>
      }
    >
      {status === "loading" || status === "idle" ? (
        <Skeleton className="m-4 h-24" />
      ) : status === "error" ? (
        <ErrorState message={error} onRetry={() => void dispatch(fetchOpenOrders())} />
      ) : rows.length === 0 ? (
        <EmptyState title="No open orders" description="Orders waiting on the book appear here and update live.">
          <Button asChild size="sm" variant="outline">
            <Link href="/trade">Trade</Link>
          </Button>
        </EmptyState>
      ) : (
        <OpenOrdersTable orders={rows} markets={markets} cancelling={cancelling} onCancel={(id) => void cancel(id).catch(() => {})} />
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancellable.length} open orders?</AlertDialogTitle>
            <AlertDialogDescription>Each order is cancelled separately. Anything that fills before a cancel reaches the engine stays filled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep orders</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancelMany(cancellable.map((o) => o.orderId))}>Cancel orders</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}

export function OrderHistoryView() {
  const markets = useMarketMap()
  const [symbol, setSymbol] = useState("all")
  const closed = useAppSelector((s) => Object.keys(s.orders.closed).length)
  const list = usePagedList((before, limit) => ordersApi.list({ status: "closed", symbol: symbol === "all" ? undefined : symbol, before, limit }), (o) => o.orderId, {
    pageSize: 50,
    key: `${symbol}:${closed}`,
  })
  return (
    <Panel title="Order history" actions={<MarketFilter value={symbol} onChange={setSymbol} />}>
      {list.status === "loading" ? (
        <Skeleton className="m-4 h-32" />
      ) : list.status === "error" ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState title="No closed orders yet" />
      ) : (
        <>
          <OrderHistoryTable orders={list.rows} markets={markets} />
          <Pager list={list} />
        </>
      )}
    </Panel>
  )
}

export function TradeHistoryView() {
  const markets = useMarketMap()
  const [symbol, setSymbol] = useState("all")
  const [fills, setFills] = useState(0)
  useUserEvents((m) => {
    if (m.type === "trade.executed") setFills((n) => n + 1)
  })
  const list = usePagedList((before, limit) => ordersApi.trades({ symbol: symbol === "all" ? undefined : symbol, before, limit }), (f) => f.tradeId, {
    pageSize: 50,
    key: `${symbol}:${fills}`,
  })
  return (
    <Panel title="Trade history" actions={<MarketFilter value={symbol} onChange={setSymbol} />}>
      {list.status === "loading" ? (
        <Skeleton className="m-4 h-32" />
      ) : list.status === "error" ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState title="No trades yet" description="Your executions appear here with price, fee and maker/taker role." />
      ) : (
        <>
          <FillsTable fills={list.rows} markets={markets} />
          <Pager list={list} />
        </>
      )}
    </Panel>
  )
}

/** One order with its executions; refreshed whenever an event names it. */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const markets = useMarketMap()
  const cancel = useCancelOrder()
  const cancelling = useAppSelector((s) => s.orders.cancelling[orderId] === true)
  const [state, setState] = useState<{ order: OrderDetail | null; error: string | null; status: number | null }>({ order: null, error: null, status: null })
  const [nonce, setNonce] = useState(0)
  const [lastReason, setLastReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ordersApi
      .get(orderId)
      .then((order) => !cancelled && setState({ order, error: null, status: null }))
      .catch((err: unknown) => {
        if (cancelled) return
        const e = toApiError(err)
        setState((s) => ({ ...s, error: e.message, status: e.status }))
      })
    return () => {
      cancelled = true
    }
  }, [orderId, nonce])

  useUserEvents((m) => {
    if (m.type === "balance.updated" || m.type === "deposit.completed") return
    if (m.data.orderId !== orderId) return
    if (m.type === "order.cancelled" || m.type === "order.rejected" || m.type === "order.cancel_rejected") setLastReason(m.data.reason)
    // order-service may persist the fill a moment after the socket reports it.
    setTimeout(() => setNonce((n) => n + 1), 400)
  })

  const o = state.order
  if (!o && state.status === 404) return <ErrorState title="Order not found" message="It does not exist or belongs to another account." />
  if (!o && state.error) return <ErrorState message={state.error} onRetry={() => setNonce((n) => n + 1)} />
  if (!o) return <Skeleton className="h-80" />

  const m = markets[o.symbol]
  const p = m?.pricePrecision ?? 8
  const q = m?.quantityPrecision ?? 8
  const quoteTotal = o.fills.reduce((s, f) => D.add(s, f.quoteAmount), "0")
  const feeTotal = o.fills.reduce((s, f) => D.add(s, f.fee), "0")
  const isOpen = OPEN_STATUSES.includes(o.status)
  const pct = D.isZero(o.quantity) ? "0" : D.div(D.mul(o.executedQuantity, "100"), o.quantity, 2)

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={
          <span className="flex items-center gap-2 text-sm font-medium">
            <SideLabel side={o.side} /> {m ? `${m.baseAsset}/${m.quoteAsset}` : o.symbol}
            <span className="text-muted-foreground">· {o.orderType === "LIMIT" ? "Limit" : "Market"}</span>
          </span>
        }
        actions={
          <>
            {cancelling ? <StatusBadge status="PENDING" label="Cancelling" /> : <StatusBadge status={o.status} />}
            {isOpen ? (
              <Button variant="outline" size="xs" disabled={cancelling} onClick={() => void cancel(o.orderId).catch(() => {})}>
                {cancelling ? <Spinner data-icon="inline-start" /> : null}
                Cancel order
              </Button>
            ) : null}
          </>
        }
        bodyClassName="p-5"
      >
        <DetailList
          items={[
            { label: "Limit price", value: <span className="num">{o.price ? `${formatAmount(o.price, p)} ${m?.quoteAsset ?? ""}` : "Market"}</span> },
            { label: "Average fill price", value: <span className="num">{formatAmount(o.averagePrice, p)}</span> },
            { label: "Amount", value: <span className="num">{formatAmount(o.quantity, q)} {m?.baseAsset}</span> },
            { label: "Filled", value: <span className="num">{formatAmount(o.executedQuantity, q)} ({formatAmount(pct, 2, { trim: true })}%)</span> },
            { label: "Remaining", value: <span className="num">{formatAmount(o.remainingQuantity, q)}</span> },
            { label: "Total traded", value: <span className="num">{formatAmount(quoteTotal, p)} {m?.quoteAsset}</span> },
            { label: "Fees paid", value: <span className="num">{formatAmount(feeTotal, 8, { trim: true })} {m?.quoteAsset}</span> },
            { label: "Time in force", value: `${o.timeInForce}${o.postOnly ? " · post-only" : ""}` },
            { label: "Created", value: <span className="num">{formatDateTime(o.createdAt)}</span> },
            { label: "Last update", value: <span className="num">{formatDateTime(o.updatedAt)}</span> },
            { label: "Order ID", value: <span className="num text-xs">{o.orderId}</span> },
            ...(lastReason ? [{ label: "Reason", value: reasonLabel(lastReason) }] : []),
          ]}
        />
        {o.status === "PENDING" ? <p className="mt-4 text-xs text-muted-foreground">Accepted and funds reserved; waiting for the matching engine. Nothing has executed yet.</p> : null}
      </Panel>
      <Panel title={`Executions (${o.fills.length})`}>
        {o.fills.length === 0 ? <EmptyState title="No executions" description={isOpen ? "Fills appear here as the order trades." : undefined} className="py-6" /> : <FillsTable fills={o.fills} markets={markets} showOrder={false} />}
      </Panel>
    </div>
  )
}
