"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/common/market-ui"
import { Panel } from "@/components/common/page"
import { EmptyState, ErrorState } from "@/components/common/states"
import { usePagedList, useUserEvents, type PagedList } from "@/hooks/use-account"
import { useAppSelector } from "@/hooks/useRedux"
import { walletApi } from "@/lib/api/wallet"
import type { Deposit, DepositStatus, LedgerEntry, LedgerReferenceType } from "@/lib/api/types"
import { formatAmount, formatDateTime, shortId } from "@/lib/format"
import { cn } from "@/lib/utils"
import { depositStatusLabel } from "./deposit-status"

const head = "h-8 text-xs font-normal text-muted-foreground"

function Pager<T>({ list }: { list: PagedList<T> }) {
  if (!list.hasMore && !list.error) return null
  return (
    <div className="flex items-center justify-center gap-3 border-t py-2">
      {list.error && list.rows.length ? <span className="text-xs text-destructive">{list.error}</span> : null}
      {list.hasMore ? (
        <Button variant="ghost" size="xs" onClick={list.loadMore} disabled={list.loadingMore}>
          {list.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}

function ListBody<T>({ list, empty, children }: { list: PagedList<T>; empty: string; children: React.ReactNode }) {
  if (list.status === "loading") return <Skeleton className="m-4 h-32" />
  if (list.status === "error") return <ErrorState message={list.error} onRetry={list.reload} />
  if (list.rows.length === 0) return <EmptyState title={empty} />
  return (
    <>
      {children}
      <Pager list={list} />
    </>
  )
}

function useDepositRefresh() {
  const [n, setN] = useState(0)
  useUserEvents((m) => {
    if (m.type === "deposit.completed") setN((x) => x + 1)
  })
  return n
}

export function DepositsTable({ rows }: { rows: Deposit[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Created</TableHead>
          <TableHead className={cn(head, "text-right")}>Amount</TableHead>
          <TableHead className={head}>Method</TableHead>
          <TableHead className={head}>Status</TableHead>
          <TableHead className={cn(head, "hidden md:table-cell")}>Completed</TableHead>
          <TableHead className={cn(head, "w-16")} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.depositId}>
            <TableCell className="num py-2 text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</TableCell>
            <TableCell className="num py-2 text-right text-xs font-medium">
              {formatAmount(d.amount, 8, { trim: true })} {d.asset}
            </TableCell>
            <TableCell className="py-2 text-xs">{d.method === "RAZORPAY" ? "Razorpay (INR)" : d.method}</TableCell>
            <TableCell className="py-2 text-xs">
              <StatusBadge status={d.status} label={depositStatusLabel(d.status)} />
            </TableCell>
            <TableCell className="num hidden py-2 text-xs text-muted-foreground md:table-cell">{formatDateTime(d.completedAt)}</TableCell>
            <TableCell className="py-2 text-right text-xs">
              <Link href={`/wallet/deposits/${d.depositId}`} className="text-muted-foreground hover:text-foreground hover:underline">
                Details
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function RecentDeposits() {
  const refresh = useDepositRefresh()
  const list = usePagedList((before, limit) => walletApi.deposits({ before, limit }), (d) => d.depositId, { pageSize: 5, key: String(refresh) })
  return (
    <Panel
      title="Recent deposits"
      actions={
        <Link href="/wallet/history" className="text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      }
    >
      {list.status === "loading" ? (
        <Skeleton className="m-4 h-20" />
      ) : list.status === "error" ? (
        <ErrorState message={list.error} onRetry={list.reload} className="py-4" />
      ) : list.rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No deposits yet.</p>
      ) : (
        <ul className="divide-y">
          {list.rows.map((d) => (
            <li key={d.depositId}>
              <Link href={`/wallet/deposits/${d.depositId}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/50">
                <span className="flex flex-col">
                  <span className="num text-sm font-medium">
                    {formatAmount(d.amount, 8, { trim: true })} {d.asset}
                  </span>
                  <span className="num text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                </span>
                <StatusBadge status={d.status} label={depositStatusLabel(d.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const DEPOSIT_FILTERS: Array<{ value: DepositStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "PENDING", label: "Awaiting payment" },
  { value: "CONFIRMING", label: "Confirming" },
  { value: "COMPLETED", label: "Credited" },
  { value: "FAILED", label: "Failed" },
]

export function DepositHistory() {
  const [status, setStatus] = useState<DepositStatus | "all">("all")
  const refresh = useDepositRefresh()
  const list = usePagedList((before, limit) => walletApi.deposits({ status: status === "all" ? undefined : status, before, limit }), (d) => d.depositId, {
    pageSize: 25,
    key: `${status}:${refresh}`,
  })
  return (
    <Panel
      title="Deposits"
      actions={
        <Select value={status} onValueChange={(v) => setStatus(v as DepositStatus | "all")}>
          <SelectTrigger size="sm" className="h-7 w-40 text-xs" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DEPOSIT_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    >
      <ListBody list={list} empty="No deposits">
        <DepositsTable rows={list.rows} />
      </ListBody>
    </Panel>
  )
}

const REF_LABEL: Record<LedgerReferenceType, string> = { DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", TRADE: "Trade", FEE: "Trading fee", ADJUSTMENT: "Adjustment" }

function referenceCell(e: LedgerEntry) {
  if (e.referenceType === "DEPOSIT") {
    return (
      <Link href={`/wallet/deposits/${e.referenceId}`} className="num hover:text-foreground hover:underline">
        {shortId(e.referenceId)}
      </Link>
    )
  }
  return (
    <span className="num" title={e.referenceType === "TRADE" || e.referenceType === "FEE" ? `Execution ${e.referenceId}` : e.referenceId}>
      {shortId(e.referenceId, 14)}
    </span>
  )
}

/** Every balance movement from the ledger. Reservations are not ledger entries (they only change "in orders"). */
export function LedgerHistory() {
  const assets = useAppSelector((s) => s.wallet.assets)
  const [assetId, setAssetId] = useState("all")
  const [ref, setRef] = useState<LedgerReferenceType | "all">("all")
  const list = usePagedList(
    (before, limit) => walletApi.ledger({ assetId: assetId === "all" ? undefined : assetId, referenceType: ref === "all" ? undefined : ref, before, limit }),
    (e) => e.ledgerId,
    { pageSize: 50, key: `${assetId}:${ref}` },
  )
  return (
    <Panel
      title="Transactions"
      actions={
        <>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label="Filter by asset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all" className="text-xs">
                  All assets
                </SelectItem>
                {assets.map((a) => (
                  <SelectItem key={a.assetId} value={a.assetId} className="text-xs">
                    {a.symbol}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={ref} onValueChange={(v) => setRef(v as LedgerReferenceType | "all")}>
            <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all" className="text-xs">
                  All types
                </SelectItem>
                {(["DEPOSIT", "TRADE", "FEE"] as const).map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {REF_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </>
      }
    >
      <ListBody list={list} empty="No transactions">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>Time</TableHead>
              <TableHead className={head}>Type</TableHead>
              <TableHead className={head}>Asset</TableHead>
              <TableHead className={cn(head, "text-right")}>Amount</TableHead>
              <TableHead className={cn(head, "hidden sm:table-cell")}>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((e) => (
              <TableRow key={e.ledgerId}>
                <TableCell className="num py-2 text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                <TableCell className="py-2 text-xs">{REF_LABEL[e.referenceType] ?? e.referenceType}</TableCell>
                <TableCell className="py-2 text-xs font-medium">{e.asset}</TableCell>
                <TableCell className={cn("num py-2 text-right text-xs font-medium", e.entryType === "CREDIT" ? "text-up" : "text-down")}>
                  {e.entryType === "CREDIT" ? "+" : "−"}
                  {formatAmount(e.amount, 8, { trim: true })}
                </TableCell>
                <TableCell className="hidden py-2 text-xs text-muted-foreground sm:table-cell">{referenceCell(e)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListBody>
    </Panel>
  )
}
