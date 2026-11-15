"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CircleAlertIcon, CoinsIcon, LockIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Panel } from "@/components/common/page"
import { Unavailable } from "@/components/common/states"
import { useAuth } from "@/hooks/use-account"
import { walletApi } from "@/lib/api/wallet"
import { toApiError } from "@/lib/api/client"
import type { DepositQuote } from "@/lib/api/types"
import { formatAmount } from "@/lib/format"
import { loadRazorpay, RAZORPAY_KEY } from "@/lib/razorpay"

const PRESETS = ["500", "1000", "5000", "10000"] as const
const AMOUNT_RE = /^\d*(\.\d{0,2})?$/
const QUOTE_DELAY = 350

type Phase = "idle" | "starting" | "checkout" | "verifying"

/**
 * INR → USDC through Razorpay:
 * quote → init-deposit (PENDING deposit + Razorpay order) → Checkout →
 * verify (CONFIRMING; credits nothing) → the deposit page waits for the
 * signed webhook (deposit.completed / COMPLETED).
 */
export function DepositForm() {
  const router = useRouter()
  const { user } = useAuth()
  const [amount, setAmount] = useState("1000")
  const [quote, setQuote] = useState<{ for: string; data: DepositQuote | null; error: string | null } | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)

  // Server-side quote (same validation and rounding as init-deposit).
  useEffect(() => {
    if (!amount || Number(amount) <= 0) return
    let cancelled = false
    const t = setTimeout(() => {
      walletApi
        .quote(amount)
        .then((data) => !cancelled && setQuote({ for: amount, data, error: null }))
        .catch((err: unknown) => !cancelled && setQuote({ for: amount, data: null, error: toApiError(err).message }))
    }, QUOTE_DELAY)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [amount])

  const current = quote?.for === amount ? quote : null
  const busy = phase !== "idle"
  const canPay = !!current?.data && !busy && RAZORPAY_KEY !== ""

  const pay = async () => {
    if (!canPay) return
    setError(null)
    setPhase("starting")
    const [loaded, order] = await Promise.all([
      loadRazorpay(),
      walletApi
        .initDeposit(amount)
        .then((r) => r.data)
        .catch((err: unknown) => {
          setError(toApiError(err, "Could not start the deposit").message)
          return null
        }),
    ])
    if (!order) return setPhase("idle")
    if (!loaded || !window.Razorpay) {
      setError("Razorpay Checkout failed to load. Check your connection and try again.")
      return setPhase("idle")
    }
    const depositId = order.receipt
    const checkout = new window.Razorpay({
      key: RAZORPAY_KEY,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: "Aurax",
      description: "INR deposit credited as USDC",
      prefill: { name: user?.name, email: user?.email },
      notes: { depositId },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          setPhase((p) => (p === "checkout" ? "idle" : p))
          toast.info("Checkout closed", { description: "If a payment went through, it will appear in your deposit history once Razorpay confirms it." })
        },
      },
      retry: { enabled: true, max_count: 3 },
      handler: (res) => {
        setPhase("verifying")
        walletApi
          .verifyPayment(res)
          .then(({ data }) => router.push(`/wallet/deposits/${data.depositId}`))
          .catch((err: unknown) => {
            // The webhook may still credit the payment; the deposit page shows its real status.
            toast.error("We couldn't verify the payment yet", { description: toApiError(err).message })
            router.push(`/wallet/deposits/${depositId}`)
          })
      },
    })
    checkout.on("payment.failed", (r) => toast.error("Payment failed", { description: r.error.description }))
    setPhase("checkout")
    checkout.open()
  }

  if (!RAZORPAY_KEY) {
    return (
      <Unavailable
        icon={CoinsIcon}
        title="INR deposits"
        description="Razorpay is not configured for this deployment (NEXT_PUBLIC_RAZORPAY_KEY is unset), so deposits cannot be started here."
      />
    )
  }

  const invalid = current?.error ?? null

  return (
    <Panel title="Deposit INR" bodyClassName="p-5">
      <FieldGroup className="gap-5">
        <Field data-invalid={invalid ? true : undefined}>
          <FieldLabel htmlFor="deposit-amount">You pay</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon className="text-base">₹</InputGroupAddon>
            <InputGroupInput
              id="deposit-amount"
              inputMode="decimal"
              autoComplete="off"
              className="num text-lg"
              value={amount}
              disabled={busy}
              aria-invalid={invalid ? true : undefined}
              aria-describedby="deposit-amount-hint"
              onChange={(e) => AMOUNT_RE.test(e.target.value) && setAmount(e.target.value)}
            />
            <InputGroupAddon align="inline-end">INR</InputGroupAddon>
          </InputGroup>
          {invalid ? (
            <FieldError id="deposit-amount-hint">{invalid}</FieldError>
          ) : (
            <FieldDescription id="deposit-amount-hint">
              {current?.data ? `Between ₹${formatAmount(current.data.minAmount, 0)} and ₹${formatAmount(current.data.maxAmount, 0)}.` : "Up to 2 decimal places."}
            </FieldDescription>
          )}
          <ToggleGroup type="single" variant="outline" size="sm" value={PRESETS.find((p) => p === amount) ?? ""} onValueChange={(v) => v && setAmount(v)} disabled={busy} aria-label="Quick amounts" className="grid w-full grid-cols-4">
            {PRESETS.map((p) => (
              <ToggleGroupItem key={p} value={p} className="num w-full">
                ₹{formatAmount(p, 0)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">You receive</span>
            {current?.data ? (
              <span className="num text-lg font-semibold">{formatAmount(current.data.creditAmount, 8, { trim: true })} USDC</span>
            ) : amount && !invalid ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Rate</span>
            <span className="num">{current?.data ? `1 USDC = ₹${formatAmount(current.data.rate, 2)} (indicative, set by Aurax)` : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Credited to</span>
            <span>Spot wallet, after Razorpay confirms the payment</span>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Deposit not started</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button size="lg" className="h-11 w-full" disabled={!canPay} onClick={() => void pay()} onPointerEnter={() => void loadRazorpay()}>
          {busy ? <Spinner data-icon="inline-start" /> : <LockIcon data-icon="inline-start" />}
          {phase === "starting" ? "Preparing checkout…" : phase === "checkout" ? "Complete payment in Razorpay" : phase === "verifying" ? "Verifying payment…" : `Pay ₹${formatAmount(amount || "0", 2)}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          Card and UPI details are entered on Razorpay&apos;s page and never reach Aurax. Abandoned payments stay &quot;Awaiting payment&quot; in your{" "}
          <Link href="/wallet/history" className="underline-offset-2 hover:underline">
            deposit history
          </Link>
          ; start a new deposit to retry.
        </p>
      </FieldGroup>
    </Panel>
  )
}
