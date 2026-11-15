"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FillsTable, OpenOrdersTable, OrderHistoryTable } from "@/components/orders/order-tables"
import { AssetIcon } from "@/components/common/market-ui"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useAuth, usePagedList } from "@/hooks/use-account"
import { useCancelMany, useCancelOrder, useMarketMap } from "@/hooks/use-orders"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { ordersApi } from "@/lib/api/orders"
import { formatAmount } from "@/lib/format"
import * as D from "@/lib/decimal"
import { fetchOpenOrders } from "@/store/slices/orders"
import { useTerminal } from "./terminal-context"

function LoadMore({ list }: { list: { hasMore: boolean; loadingMore: boolean; loadMore: () => void } }) {
  if (!list.hasMore) return null
  return (
    <div className="flex justify-center border-t py-2">
      <Button variant="ghost" size="xs" disabled={list.loadingMore} onClick={list.loadMore}>
        {list.loadingMore ? "Loading…" : "Load more"}
      </Button>
    </div>
  )
}

function OpenOrdersTab({ onlyThis }: { onlyThis: boolean }) {
  const { market } = useTerminal()
  const dispatch = useAppDispatch()
  const markets = useMarketMap()
  const { open, status, error, cancelling } = useAppSelector((s) => s.orders)
  const cancel = useCancelOrder()
  const cancelMany = useCancelMany()
  const [confirmAll, setConfirmAll] = useState(false)
  const rows = useMemo(() => (onlyThis ? open.filter((o) => o.symbol === market.symbol) : open), [open, onlyThis, market.symbol])
  const cancellable = rows.filter((o) => !cancelling[o.orderId])

  if (status === "loading" || status === "idle") return <Skeleton className="m-3 h-16" />
  if (status === "error") return <ErrorState message={error} onRetry={() => void dispatch(fetchOpenOrders())} />
  if (rows.length === 0) return <EmptyState title="No open orders" className="py-6" />
  return (
    <>
      <OpenOrdersTable orders={rows} markets={markets} cancelling={cancelling} onCancel={(id) => void cancel(id).catch(() => {})} dense />
      {cancellable.length > 1 ? (
        <div className="flex justify-end border-t px-3 py-1.5">
          <Button variant="ghost" size="xs" onClick={() => setConfirmAll(true)}>
            Cancel all ({cancellable.length})
          </Button>
        </div>
      ) : null}
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancellable.length} open orders?</AlertDialogTitle>
            <AlertDialogDescription>Each order is cancelled individually. Any part that fills before the cancel reaches the engine stays filled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep orders</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancelMany(cancellable.map((o) => o.orderId))}>Cancel orders</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function HistoryTab({ onlyThis }: { onlyThis: boolean }) {
  const { market } = useTerminal()
  const markets = useMarketMap()
  const symbol = onlyThis ? market.symbol : undefined
  // Refresh history when orders close.
  const closedCount = useAppSelector((s) => Object.keys(s.orders.closed).length)
  const list = usePagedList((before, limit) => ordersApi.list({ status: "closed", symbol, before, limit }), (o) => o.orderId, { pageSize: 25, key: `${symbol}:${closedCount}` })
  if (list.status === "loading") return <Skeleton className="m-3 h-16" />
  if (list.status === "error") return <ErrorState message={list.error} onRetry={list.reload} />
  if (list.rows.length === 0) return <EmptyState title="No order history" className="py-6" />
  return (
    <>
      <OrderHistoryTable orders={list.rows} markets={markets} />
      <LoadMore list={list} />
    </>
  )
}

function FillsTab({ onlyThis }: { onlyThis: boolean }) {
  const { market } = useTerminal()
  const markets = useMarketMap()
  const symbol = onlyThis ? market.symbol : undefined
  const fillsSeen = useAppSelector((s) => s.notifications.items.length)
  const list = usePagedList((before, limit) => ordersApi.trades({ symbol, before, limit }), (f) => f.tradeId, { pageSize: 25, key: `${symbol}:${fillsSeen}` })
  if (list.status === "loading") return <Skeleton className="m-3 h-16" />
  if (list.status === "error") return <ErrorState message={list.error} onRetry={list.reload} />
  if (list.rows.length === 0) return <EmptyState title="No trades yet" className="py-6" />
  return (
    <>
      <FillsTable fills={list.rows} markets={markets} />
      <LoadMore list={list} />
    </>
  )
}

function BalancesTab() {
  const { market } = useTerminal()
  const assets = useAppSelector((s) => s.wallet.assets)
  const status = useAppSelector((s) => s.wallet.status)
  const rows = assets.filter((a) => a.symbol === market.baseAsset || a.symbol === market.quoteAsset || !D.isZero(D.add(a.availableBalance, a.lockedBalance)))
  if (status !== "ready") return <Skeleton className="m-3 h-16" />
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-xs font-normal text-muted-foreground">Asset</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Total</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Available</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">In orders</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.assetId}>
            <TableCell className="py-1.5 text-xs">
              <span className="flex items-center gap-2">
                <AssetIcon symbol={a.symbol} imageUrl={a.imageUrl} className="size-5" />
                <span className="font-medium">{a.symbol}</span>
              </span>
            </TableCell>
            <TableCell className="num py-1.5 text-right text-xs">{formatAmount(D.add(a.availableBalance, a.lockedBalance), 8, { trim: true })}</TableCell>
            <TableCell className="num py-1.5 text-right text-xs">{formatAmount(a.availableBalance, 8, { trim: true })}</TableCell>
            <TableCell className="num py-1.5 text-right text-xs text-muted-foreground">{formatAmount(a.lockedBalance, 8, { trim: true })}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AccountPanel({ className }: { className?: string }) {
  const { market } = useTerminal()
  const pathname = usePathname()
  const { isAuthenticated, isPending } = useAuth()
  const openCount = useAppSelector((s) => s.orders.open.length)
  const [tab, setTab] = useState("open")
  const [onlyThis, setOnlyThis] = useState(false)

  return (
    <section aria-label="Your orders and trades" className={className}>
      <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col rounded-xl border bg-panel glass-edge">
        <div className="flex items-center justify-between gap-2 border-b px-2">
          <TabsList className="h-10 bg-transparent p-0">
            <TabsTrigger value="open" className="text-xs data-[state=active]:shadow-none">
              Open orders{isAuthenticated ? ` (${openCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs data-[state=active]:shadow-none">
              Order history
            </TabsTrigger>
            <TabsTrigger value="fills" className="text-xs data-[state=active]:shadow-none">
              Trade history
            </TabsTrigger>
            <TabsTrigger value="balances" className="text-xs data-[state=active]:shadow-none">
              Balances
            </TabsTrigger>
          </TabsList>
          {isAuthenticated && tab !== "balances" ? (
            <div className="flex shrink-0 items-center gap-2 pr-1">
              <Checkbox id="only-this-market" checked={onlyThis} onCheckedChange={(v) => setOnlyThis(v === true)} />
              <Label htmlFor="only-this-market" className="text-xs font-normal text-muted-foreground">
                {market.baseAsset}/{market.quoteAsset} only
              </Label>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isPending ? (
            <Skeleton className="m-3 h-16" />
          ) : !isAuthenticated ? (
            <EmptyState title="Log in to see your orders" className="py-6">
              <Button asChild size="sm">
                <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in</Link>
              </Button>
            </EmptyState>
          ) : (
            <>
              <TabsContent value="open">
                <OpenOrdersTab onlyThis={onlyThis} />
              </TabsContent>
              <TabsContent value="history">{tab === "history" ? <HistoryTab onlyThis={onlyThis} /> : null}</TabsContent>
              <TabsContent value="fills">{tab === "fills" ? <FillsTab onlyThis={onlyThis} /> : null}</TabsContent>
              <TabsContent value="balances">
                <BalancesTab />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </section>
  )
}
