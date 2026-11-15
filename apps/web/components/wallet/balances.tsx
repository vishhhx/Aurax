"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, RotateCwIcon } from "lucide-react"
import * as D from "@/lib/decimal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AssetIcon } from "@/components/common/market-ui"
import { Panel } from "@/components/common/page"
import { EmptyState, ErrorState } from "@/components/common/states"
import { useMarkets, useTickers } from "@/hooks/use-market-data"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { formatAmount } from "@/lib/format"
import { assetValue, portfolioValue, totalBalance, VALUATION_ASSET } from "@/lib/trading/valuation"
import { fetchWallet } from "@/store/slices/wallet"

/** Estimated total in USDC, clearly labelled as an estimate. */
export function PortfolioSummary({ actions = true }: { actions?: boolean }) {
  const assets = useAppSelector((s) => s.wallet.assets)
  const status = useAppSelector((s) => s.wallet.status)
  const { markets } = useMarkets()
  const symbols = useMemo(() => markets.map((m) => m.symbol), [markets])
  const { bySymbol } = useTickers(symbols)
  const { total, unvalued } = useMemo(() => portfolioValue(assets, bySymbol), [assets, bySymbol])
  const locked = useMemo(() => {
    let sum = "0"
    for (const a of assets) {
      if (D.isZero(a.lockedBalance)) continue
      const v = assetValue(a.symbol, a.lockedBalance, bySymbol)
      if (v) sum = D.add(sum, v)
    }
    return sum
  }, [assets, bySymbol])

  return (
    <Panel bodyClassName="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Estimated value ({VALUATION_ASSET})</span>
        {status === "ready" ? (
          <span className="num text-3xl font-semibold tracking-tight">{formatAmount(total, 2)}</span>
        ) : status === "error" ? (
          <span className="text-sm text-muted-foreground">Balances unavailable</span>
        ) : (
          <Skeleton className="h-9 w-48" />
        )}
        <span className="text-xs text-muted-foreground">
          In open orders ≈ <span className="num">{formatAmount(locked, 2)}</span> {VALUATION_ASSET}
          {unvalued.length ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 underline decoration-dotted underline-offset-2">· {unvalued.length} not valued</span>
              </TooltipTrigger>
              <TooltipContent>{unvalued.join(", ")} has no {VALUATION_ASSET} market price yet, so it is excluded from the estimate.</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      </div>
      {actions ? (
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/wallet/deposit">
              <ArrowDownToLineIcon data-icon="inline-start" />
              Deposit
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/wallet/withdraw">
              <ArrowUpFromLineIcon data-icon="inline-start" />
              Withdraw
            </Link>
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}

export function BalancesTable({ compact = false }: { compact?: boolean }) {
  const dispatch = useAppDispatch()
  const { assets, status, error } = useAppSelector((s) => s.wallet)
  const { markets } = useMarkets()
  const symbols = useMemo(() => markets.map((m) => m.symbol), [markets])
  const { bySymbol } = useTickers(symbols)
  const [hideZero, setHideZero] = useState(compact)

  const rows = useMemo(() => {
    const list = assets.map((a) => ({ a, total: totalBalance(a) }))
    const shown = hideZero ? list.filter((r) => !D.isZero(r.total)) : list
    return shown.sort((x, y) => D.cmp(y.total, x.total) || x.a.symbol.localeCompare(y.a.symbol))
  }, [assets, hideZero])

  const marketFor = (asset: string) => markets.find((m) => m.baseAsset === asset) ?? markets.find((m) => m.quoteAsset === asset)

  return (
    <Panel
      title="Balances"
      actions={
        <>
          <div className="flex items-center gap-2">
            <Checkbox id="hide-zero" checked={hideZero} onCheckedChange={(v) => setHideZero(v === true)} />
            <Label htmlFor="hide-zero" className="text-xs font-normal text-muted-foreground">
              Hide zero balances
            </Label>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Refresh balances" onClick={() => void dispatch(fetchWallet())}>
            <RotateCwIcon />
          </Button>
        </>
      }
    >
      {status === "error" && assets.length === 0 ? (
        <ErrorState message={error} onRetry={() => void dispatch(fetchWallet())} />
      ) : status !== "ready" ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={hideZero ? "No balances yet" : "No assets listed"} description={hideZero ? "Deposit INR to receive USDC and start trading." : undefined}>
          {hideZero ? (
            <Button asChild size="sm">
              <Link href="/wallet/deposit">Deposit</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-normal text-muted-foreground">Asset</TableHead>
              <TableHead className="text-right text-xs font-normal text-muted-foreground">Total</TableHead>
              <TableHead className="text-right text-xs font-normal text-muted-foreground">Available</TableHead>
              <TableHead className="hidden text-right text-xs font-normal text-muted-foreground sm:table-cell">In orders</TableHead>
              <TableHead className="hidden text-right text-xs font-normal text-muted-foreground md:table-cell">Est. value ({VALUATION_ASSET})</TableHead>
              {compact ? null : <TableHead className="w-40" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ a, total }) => {
              const value = D.isZero(total) ? "0" : assetValue(a.symbol, total, bySymbol)
              const m = marketFor(a.symbol)
              return (
                <TableRow key={a.assetId}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <AssetIcon symbol={a.symbol} imageUrl={a.imageUrl} />
                      <span className="flex flex-col">
                        <span className="font-medium">{a.symbol}</span>
                        <span className="text-xs text-muted-foreground">{a.name}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="num text-right font-medium">{formatAmount(total, Math.min(a.decimals, 8), { trim: true })}</TableCell>
                  <TableCell className="num text-right">{formatAmount(a.availableBalance, Math.min(a.decimals, 8), { trim: true })}</TableCell>
                  <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{formatAmount(a.lockedBalance, Math.min(a.decimals, 8), { trim: true })}</TableCell>
                  <TableCell className="num hidden text-right text-muted-foreground md:table-cell">{value === null ? "—" : formatAmount(value, 2)}</TableCell>
                  {compact ? null : (
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-1">
                        {a.depositEnabled && a.symbol === "USDC" ? (
                          <Button asChild variant="ghost" size="xs">
                            <Link href="/wallet/deposit">Deposit</Link>
                          </Button>
                        ) : null}
                        {m ? (
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/trade/${m.symbol}`}>Trade</Link>
                          </Button>
                        ) : null}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}
