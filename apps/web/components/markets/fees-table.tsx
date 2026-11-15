"use client"

import Link from "next/link"
import * as D from "@/lib/decimal"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/common/market-ui"
import { ErrorState } from "@/components/common/states"
import { useMarkets } from "@/hooks/use-market-data"
import { formatFeeRate } from "@/lib/format"

const head = "text-xs font-normal text-muted-foreground"

export function FeesTable() {
  const { markets, status, error, retry } = useMarkets()
  if (status === "error") return <ErrorState message={error} onRetry={retry} />
  return (
    <div className="overflow-hidden rounded-xl border bg-panel glass-edge">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={head}>Market</TableHead>
            <TableHead className={head}>Status</TableHead>
            <TableHead className={`${head} text-right`}>Maker</TableHead>
            <TableHead className={`${head} text-right`}>Taker</TableHead>
            <TableHead className={`${head} text-right`}>Tick size</TableHead>
            <TableHead className={`${head} text-right`}>Step size</TableHead>
            <TableHead className={`${head} text-right`}>Min order value</TableHead>
            <TableHead className={`${head} hidden text-right lg:table-cell`}>Quantity range</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {status !== "ready"
            ? Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            : markets.map((m) => (
                <TableRow key={m.symbol}>
                  <TableCell>
                    <Link href={`/markets/${m.symbol}`} className="font-medium hover:underline">
                      {m.baseAsset}/{m.quoteAsset}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="num text-right">{formatFeeRate(m.makerFee)}</TableCell>
                  <TableCell className="num text-right">{formatFeeRate(m.takerFee)}</TableCell>
                  <TableCell className="num text-right">{D.normalize(m.tickSize)}</TableCell>
                  <TableCell className="num text-right">{D.normalize(m.stepSize)}</TableCell>
                  <TableCell className="num text-right">
                    {D.normalize(m.minNotional)} {m.quoteAsset}
                  </TableCell>
                  <TableCell className="num hidden text-right lg:table-cell">
                    {D.normalize(m.minQuantity)} – {D.normalize(m.maxQuantity)} {m.baseAsset}
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  )
}
