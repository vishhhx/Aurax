"use client"

import Link from "next/link"
import { XIcon } from "lucide-react"
import * as D from "@/lib/decimal"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SideLabel, StatusBadge } from "@/components/common/market-ui"
import type { Fill, MarketInfo, Order } from "@/lib/api/types"
import { formatAmount, formatDateTime, shortId } from "@/lib/format"
import { cn } from "@/lib/utils"

const prec = (markets: Record<string, MarketInfo>, symbol: string) => ({
  p: markets[symbol]?.pricePrecision ?? 8,
  q: markets[symbol]?.quantityPrecision ?? 8,
  pair: markets[symbol] ? `${markets[symbol].baseAsset}/${markets[symbol].quoteAsset}` : symbol,
})

function FilledBar({ order }: { order: Order }) {
  const pct = D.isZero(order.quantity) ? 0 : Math.min(100, Number(D.div(D.mul(order.executedQuantity, "100"), order.quantity, 2)))
  return (
    <span className="flex items-center gap-2">
      <span className="num">{pct.toFixed(pct % 1 ? 2 : 0)}%</span>
      <span aria-hidden="true" className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:block">
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

const head = "h-8 text-xs font-normal text-muted-foreground"
const cell = "py-1.5 text-xs"

export function OpenOrdersTable({
  orders,
  markets,
  cancelling,
  onCancel,
  dense = false,
}: {
  orders: Order[]
  markets: Record<string, MarketInfo>
  cancelling: Record<string, true>
  onCancel: (orderId: string) => void
  dense?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Time</TableHead>
          <TableHead className={head}>Market</TableHead>
          <TableHead className={head}>Type</TableHead>
          <TableHead className={head}>Side</TableHead>
          <TableHead className={cn(head, "text-right")}>Price</TableHead>
          <TableHead className={cn(head, "text-right")}>Amount</TableHead>
          <TableHead className={cn(head, "text-right")}>Filled</TableHead>
          {dense ? null : <TableHead className={cn(head, "text-right")}>Remaining</TableHead>}
          <TableHead className={head}>Status</TableHead>
          <TableHead className={cn(head, "w-20 text-right")}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const { p, q, pair } = prec(markets, o.symbol)
          const busy = cancelling[o.orderId] === true
          return (
            <TableRow key={o.orderId}>
              <TableCell className={cn(cell, "num whitespace-nowrap text-muted-foreground")}>{formatDateTime(o.createdAt)}</TableCell>
              <TableCell className={cell}>
                <Link href={`/orders/${o.orderId}`} className="font-medium hover:underline">
                  {pair}
                </Link>
              </TableCell>
              <TableCell className={cell}>
                {o.orderType === "LIMIT" ? "Limit" : "Market"}
                <span className="text-muted-foreground"> · {o.timeInForce}{o.postOnly ? " · Post" : ""}</span>
              </TableCell>
              <TableCell className={cell}>
                <SideLabel side={o.side} />
              </TableCell>
              <TableCell className={cn(cell, "num text-right")}>{o.price ? formatAmount(o.price, p) : "Market"}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>{formatAmount(o.quantity, q)}</TableCell>
              <TableCell className={cn(cell, "text-right")}>
                <span className="flex justify-end">
                  <FilledBar order={o} />
                </span>
              </TableCell>
              {dense ? null : <TableCell className={cn(cell, "num text-right")}>{formatAmount(o.remainingQuantity, q)}</TableCell>}
              <TableCell className={cell}>{busy ? <StatusBadge status="PENDING" label="Cancelling" /> : <StatusBadge status={o.status} />}</TableCell>
              <TableCell className={cn(cell, "text-right")}>
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => onCancel(o.orderId)} aria-label={`Cancel ${o.side.toLowerCase()} order ${shortId(o.orderId)}`}>
                  {busy ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}
                  Cancel
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function OrderHistoryTable({ orders, markets }: { orders: Order[]; markets: Record<string, MarketInfo> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Time</TableHead>
          <TableHead className={head}>Market</TableHead>
          <TableHead className={head}>Type</TableHead>
          <TableHead className={head}>Side</TableHead>
          <TableHead className={cn(head, "text-right")}>Price</TableHead>
          <TableHead className={cn(head, "text-right")}>Avg. fill</TableHead>
          <TableHead className={cn(head, "text-right")}>Filled / Amount</TableHead>
          <TableHead className={head}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const { p, q, pair } = prec(markets, o.symbol)
          return (
            <TableRow key={o.orderId}>
              <TableCell className={cn(cell, "num whitespace-nowrap text-muted-foreground")}>{formatDateTime(o.createdAt)}</TableCell>
              <TableCell className={cell}>
                <Link href={`/orders/${o.orderId}`} className="font-medium hover:underline">
                  {pair}
                </Link>
              </TableCell>
              <TableCell className={cell}>
                {o.orderType === "LIMIT" ? "Limit" : "Market"}
                <span className="text-muted-foreground"> · {o.timeInForce}</span>
              </TableCell>
              <TableCell className={cell}>
                <SideLabel side={o.side} />
              </TableCell>
              <TableCell className={cn(cell, "num text-right")}>{o.price ? formatAmount(o.price, p) : "Market"}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>{formatAmount(o.averagePrice, p)}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>
                {formatAmount(o.executedQuantity, q)} / {formatAmount(o.quantity, q)}
              </TableCell>
              <TableCell className={cell}>
                <StatusBadge status={o.status} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function FillsTable({ fills, markets, showOrder = true }: { fills: Fill[]; markets: Record<string, MarketInfo>; showOrder?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Time</TableHead>
          <TableHead className={head}>Market</TableHead>
          <TableHead className={head}>Side</TableHead>
          <TableHead className={head}>Role</TableHead>
          <TableHead className={cn(head, "text-right")}>Price</TableHead>
          <TableHead className={cn(head, "text-right")}>Quantity</TableHead>
          <TableHead className={cn(head, "text-right")}>Total</TableHead>
          <TableHead className={cn(head, "text-right")}>Fee</TableHead>
          {showOrder ? <TableHead className={head}>Order</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {fills.map((f) => {
          const m = markets[f.symbol]
          const { p, q, pair } = prec(markets, f.symbol)
          return (
            <TableRow key={f.tradeId}>
              <TableCell className={cn(cell, "num whitespace-nowrap text-muted-foreground")}>{formatDateTime(f.createdAt)}</TableCell>
              <TableCell className={cn(cell, "font-medium")}>{pair}</TableCell>
              <TableCell className={cell}>
                <SideLabel side={f.side} />
              </TableCell>
              <TableCell className={cn(cell, "text-muted-foreground")}>{f.liquidity === "MAKER" ? "Maker" : "Taker"}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>{formatAmount(f.price, p)}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>{formatAmount(f.quantity, q)}</TableCell>
              <TableCell className={cn(cell, "num text-right")}>
                {formatAmount(f.quoteAmount, p, { trim: false })} <span className="text-muted-foreground">{m?.quoteAsset}</span>
              </TableCell>
              <TableCell className={cn(cell, "num text-right")}>
                {formatAmount(f.fee, 8, { trim: true })} <span className="text-muted-foreground">{m?.quoteAsset}</span>
              </TableCell>
              {showOrder ? (
                <TableCell className={cell}>
                  <Link href={`/orders/${f.orderId}`} className="num text-muted-foreground hover:text-foreground hover:underline">
                    {shortId(f.orderId)}
                  </Link>
                </TableCell>
              ) : null}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
