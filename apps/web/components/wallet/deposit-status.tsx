"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckIcon, CircleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/common/market-ui"
import { DetailList, Panel } from "@/components/common/page"
import { ErrorState } from "@/components/common/states"
import { useUserEvents } from "@/hooks/use-account"
import { walletApi } from "@/lib/api/wallet"
import { toApiError } from "@/lib/api/client"
import type { Deposit, DepositStatus } from "@/lib/api/types"
import { formatAmount, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const POLL_MS = 3_000
/** Stop polling after this long; the page still updates on deposit.completed. */
const POLL_FOR_MS = 10 * 60_000

const STEPS: Array<{ status: DepositStatus; label: string; detail: string }> = [
  { status: "PENDING", label: "Awaiting payment", detail: "Deposit created; waiting for the Razorpay payment." },
  { status: "CONFIRMING", label: "Confirming", detail: "Payment signature verified; waiting for Razorpay to confirm capture." },
  { status: "COMPLETED", label: "Credited", detail: "USDC added to your wallet." },
]

export function depositStatusLabel(s: DepositStatus) {
  return s === "PENDING" ? "Awaiting payment" : s === "CONFIRMING" ? "Confirming" : s === "COMPLETED" ? "Credited" : "Failed"
}

/**
 * Real deposit status from GET /wallet/deposits/:id, polled while it is not
 * terminal and refreshed immediately on deposit.completed. The UI reports
 * success only when the backend says COMPLETED.
 */
export function DepositStatusView({ depositId }: { depositId: string }) {
  const [state, setState] = useState<{ deposit: Deposit | null; error: string | null; status: number | null }>({ deposit: null, error: null, status: null })
  const [nonce, setNonce] = useState(0)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()
    const tick = () => {
      walletApi
        .deposit(depositId)
        .then((d) => {
          if (cancelled) return
          setState({ deposit: d, error: null, status: null })
          const terminal = d.status === "COMPLETED" || d.status === "FAILED"
          const expired = Date.now() - startedAt >= POLL_FOR_MS
          setStalled(!terminal && expired)
          if (!terminal && !expired) timer = setTimeout(tick, POLL_MS)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          const e = toApiError(err)
          setState((s) => ({ ...s, error: e.message, status: e.status }))
          if (e.status !== 404 && Date.now() - startedAt < POLL_FOR_MS) timer = setTimeout(tick, POLL_MS * 2)
        })
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [depositId, nonce])

  useUserEvents((m) => {
    if (m.type === "deposit.completed" && m.data.depositId === depositId) setNonce((n) => n + 1)
  })

  const d = state.deposit
  if (!d && state.status === 404) return <ErrorState title="Deposit not found" message="It does not exist or belongs to another account." />
  if (!d && state.error) return <ErrorState message={state.error} onRetry={() => setNonce((n) => n + 1)} />
  if (!d) return <Skeleton className="h-72" />

  const current = STEPS.findIndex((s) => s.status === d.status)

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Deposit status" actions={<StatusBadge status={d.status} label={depositStatusLabel(d.status)} />} bodyClassName="p-5">
        {d.status === "FAILED" ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Deposit failed</AlertTitle>
            <AlertDescription>No funds were credited. Start a new deposit to try again.</AlertDescription>
          </Alert>
        ) : (
          <ol className="flex flex-col gap-4">
            {STEPS.map((s, i) => {
              const done = i < current || d.status === "COMPLETED"
              const active = i === current && d.status !== "COMPLETED"
              return (
                <li key={s.status} className="flex gap-3" aria-current={active ? "step" : undefined}>
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      done && "border-up bg-up text-up-foreground",
                      active && "border-primary text-primary-emphasis",
                    )}
                  >
                    {done ? <CheckIcon className="size-3.5" /> : active ? <Spinner className="size-3.5" /> : i + 1}
                  </span>
                  <div>
                    <p className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {stalled ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Still not confirmed. Razorpay confirmations can take longer; this page stopped checking automatically.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setNonce((n) => n + 1)}>
              Check again
            </button>
          </p>
        ) : null}
      </Panel>

      <Panel title="Details" bodyClassName="p-5">
        <DetailList
          items={[
            { label: "Amount", value: <span className="num">{formatAmount(d.amount, 8, { trim: true })} {d.asset}</span> },
            { label: "Method", value: d.method === "RAZORPAY" ? "Razorpay (INR)" : d.method },
            { label: "Created", value: <span className="num">{formatDateTime(d.createdAt)}</span> },
            { label: "Completed", value: <span className="num">{formatDateTime(d.completedAt)}</span> },
            { label: "Deposit ID", value: <span className="num text-xs">{d.depositId}</span> },
            { label: "Razorpay order", value: <span className="num text-xs">{d.providerOrderId ?? "—"}</span> },
            { label: "Razorpay payment", value: <span className="num text-xs">{d.providerPaymentId ?? "—"}</span> },
          ]}
        />
      </Panel>

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/wallet">Wallet</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/wallet/deposit">New deposit</Link>
        </Button>
      </div>
    </div>
  )
}
