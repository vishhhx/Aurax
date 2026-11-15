"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, Panel } from "@/components/common/page"
import { EmptyState, ErrorState } from "@/components/common/states"
import { MarketsTable } from "@/components/markets/markets-table"
import { FillsTable, OpenOrdersTable } from "@/components/orders/order-tables"
import { BalancesTable, PortfolioSummary } from "@/components/wallet/balances"
import { RecentDeposits } from "@/components/wallet/history"
import { useAuth, usePagedList, useUserEvents } from "@/hooks/use-account"
import { useCancelOrder, useMarketMap } from "@/hooks/use-orders"
import { useAppSelector } from "@/hooks/useRedux"
import { ordersApi } from "@/lib/api/orders"


function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">
      View all
    </Link>
  )
}

function OpenOrdersCard() {
  const markets = useMarketMap()
  const { open, status, cancelling } = useAppSelector((s) => s.orders)
  const cancel = useCancelOrder()
  return (
    <Panel title={`Open orders (${open.length})`} actions={<ViewAll href="/orders" />}>
      {status === "loading" || status === "idle" ? (
        <Skeleton className="m-4 h-16" />
      ) : open.length === 0 ? (
        <EmptyState title="No open orders" className="py-6" />
      ) : (
        <OpenOrdersTable orders={open.slice(0, 5)} markets={markets} cancelling={cancelling} onCancel={(id) => void cancel(id).catch(() => {})} dense />
      )}
    </Panel>
  )
}

function RecentFillsCard() {
  const markets = useMarketMap()
  const [n, setN] = useState(0)
  useUserEvents((m) => {
    if (m.type === "trade.executed") setN((x) => x + 1)
  })
  const list = usePagedList((before, limit) => ordersApi.trades({ before, limit }), (f) => f.tradeId, { pageSize: 5, key: String(n) })
  return (
    <Panel title="Recent trades" actions={<ViewAll href="/orders/trades" />}>
      {list.status === "loading" ? (
        <Skeleton className="m-4 h-16" />
      ) : list.status === "error" ? (
        <ErrorState message={list.error} onRetry={list.reload} className="py-6" />
      ) : list.rows.length === 0 ? (
        <EmptyState title="No trades yet" className="py-6" />
      ) : (
        <FillsTable fills={list.rows} markets={markets} showOrder={false} />
      )}
    </Panel>
  )
}

export function DashboardView() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={user ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard"}
        description={user?.email}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/trade">Open terminal</Link>
          </Button>
        }
        className="mb-2"
      />
      <PortfolioSummary />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <BalancesTable compact />
          <OpenOrdersCard />
          <RecentFillsCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <RecentDeposits />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Markets</h2>
          <ViewAll href="/markets" />
        </div>
        <MarketsTable variant="compact" limit={5} />
      </div>
    </div>
  )
}
