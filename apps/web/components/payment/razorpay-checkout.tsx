"use client"

import { useState } from "react"
import Link from "next/link"
import axios from "axios"
import { toast } from "sonner"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CreditCardIcon,
  LandmarkIcon,
  LockIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BrandLogo } from "@/components/navbar"
import { CoinBadge } from "@/components/market/market-primitives"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { fetchWalletAssets } from "@/store/slices/walletSlice"
import { fetchUserDetails } from "@/store/slices/authSlice"
import { api } from "@/lib/axios"
import { loadRazorpay, type RazorpaySuccessResponse } from "@/lib/razorpay"
import { cn } from "@/lib/utils"

// Indicative rate shown before checkout; the backend order is the source of truth.
const USDC_INR_RATE = 95.72
const MIN_DEPOSIT = 100
const PRESETS = ["500", "1000", "5000", "10000"] as const
const AMOUNT_PATTERN = /^\d*\.?\d{0,2}$/
const NON_NUMERIC = /[^\d.]/g
const BRAND_COLOR = "#F2B20F"
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY || "rzp_test_TGF5zfMyKqMfVj"

type Phase = "idle" | "creating" | "awaiting" | "verifying" | "success"

const STEPS = ["Enter amount", "Pay securely", "USDC credited"] as const

const METHODS = [
  { icon: SmartphoneIcon, label: "UPI" },
  { icon: CreditCardIcon, label: "Cards" },
  { icon: LandmarkIcon, label: "Netbanking" },
] as const

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})
const usdcFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})
const presetFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: unknown } | undefined)?.message
    if (typeof message === "string") return message
  }
  return fallback
}

function stepIndex(phase: Phase) {
  if (phase === "success") return 3
  if (phase === "idle") return 0
  return 1
}

function CheckoutSteps({ phase }: { phase: Phase }) {
  const current = stepIndex(phase)
  return (
    <ol aria-label="Deposit progress" className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold",
                done && "border-up bg-up text-background",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "text-muted-foreground"
              )}
            >
              {done ? <CheckIcon className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("font-medium", !done && !active && "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 ? <span aria-hidden="true" className="h-px w-4 bg-border sm:w-8" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function SummaryRow({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", emphasis ? "text-base font-semibold" : "font-medium")}>{value}</dd>
    </div>
  )
}

function CheckoutHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/dashboard">
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Link>
        </Button>
        <BrandLogo />
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-3.5 text-up" />
          <span className="hidden sm:inline">Secure checkout</span>
        </span>
      </div>
    </header>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]" aria-busy="true" aria-label="Loading checkout">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

export function RazorpayCheckout() {
  const dispatch = useAppDispatch()
  const { isAuthenticated, isLoading: authLoading, status: authStatus, error: authError } = useRequireAuth()
  const user = useAppSelector((s) => s.auth.user)

  const [amount, setAmount] = useState("1000")
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)

  const spend = Math.max(Number(amount) || 0, 0)
  const receive = spend / USDC_INR_RATE
  const isBelowMin = amount !== "" && spend < MIN_DEPOSIT
  const isBusy = phase === "creating" || phase === "awaiting" || phase === "verifying"
  const canPay = spend >= MIN_DEPOSIT && !isBusy

  const handleAmountChange = (raw: string) => {
    const next = raw.replace(NON_NUMERIC, "")
    if (AMOUNT_PATTERN.test(next)) setAmount(next)
  }

  const verifyPayment = async (response: RazorpaySuccessResponse) => {
    setPhase("verifying")
    try {
      await api.post("/api/v1/wallet/payment/razorpay/verify", {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      })
      setPaymentId(response.razorpay_payment_id)
      setPhase("success")
      toast.success("Deposit successful", {
        description: "USDC has been credited to your Spot wallet.",
      })
      void dispatch(fetchWalletAssets())
    } catch (err) {
      const message = getErrorMessage(
        err,
        "We received your payment but could not verify it yet. If your balance does not update shortly, contact support."
      )
      setError(message)
      setPhase("idle")
      toast.error("Payment verification failed", { description: message })
    }
  }

  const handlePay = async () => {
    if (!canPay) return
    setError(null)
    setPhase("creating")

    const [loaded, order] = await Promise.all([
      loadRazorpay(),
      api
        .post("/api/v1/wallet/payment/razorpay/init-deposit", { amount: String(spend) })
        .then((res) => res.data.data as { id: string; amount: number; currency: string; receipt: string })
        .catch((err: unknown) => {
          setError(getErrorMessage(err, "Could not start the deposit. Please try again."))
          return null
        }),
    ])

    if (!loaded || !window.Razorpay) {
      setError("Razorpay checkout failed to load. Check your connection and try again.")
      setPhase("idle")
      return
    }
    if (!order) {
      setPhase("idle")
      return
    }

    const checkout = new window.Razorpay({
      key: RAZORPAY_KEY,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: "Aurax Exchange",
      description: "INR deposit · Buy USDC to your Spot wallet",
      image:
        "https://res.cloudinary.com/dpczfq0lo/image/upload/v1785492405/aurax_exchange_logo_ok9ni5.png",
      prefill: {
        name: user?.name ?? "",
        email: user?.email ?? "",
      },
      notes: {
        platform: "AuraX Exchange",
        purpose: "Wallet Deposit",
        asset: "USDC",
        wallet: "Spot Wallet",
        receipt: order.receipt,
      },
      theme: { color: BRAND_COLOR },
      modal: {
        backdropclose: false,
        escape: true,
        animation: true,
        confirm_close: true,
        ondismiss: () => {
          setPhase((p) => (p === "awaiting" ? "idle" : p))
          toast.info("Payment cancelled", { description: "No money was taken from your account." })
        },
      },
      retry: { enabled: true, max_count: 3 },
      handler: (response) => {
        void verifyPayment(response)
      },
    })

    checkout.on("payment.failed", (response) => {
      toast.error("Payment failed", { description: response.error.description })
    })

    setPhase("awaiting")
    checkout.open()
  }

  const resetForAnotherDeposit = () => {
    setPhase("idle")
    setPaymentId(null)
    setError(null)
  }

  const payLabel =
    phase === "creating"
      ? "Preparing checkout…"
      : phase === "awaiting"
        ? "Complete payment in Razorpay"
        : phase === "verifying"
          ? "Verifying payment…"
          : `Pay ${inrFormatter.format(spend)}`

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <CheckoutHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {authStatus === "error" ? (
          <Alert className="mx-auto flex max-w-lg gap-3 border-destructive/40 bg-destructive/10">
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-3">
              <div>
                <AlertTitle className="text-destructive">We couldn&apos;t check your session</AlertTitle>
                <AlertDescription>{authError ?? "The server is unreachable right now."}</AlertDescription>
              </div>
              <Button size="sm" variant="outline" className="w-fit" onClick={() => void dispatch(fetchUserDetails())}>
                Try again
              </Button>
            </div>
          </Alert>
        ) : authLoading || !isAuthenticated ? (
          <CheckoutSkeleton />
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Buy USDC with INR</h1>
                <p className="text-muted-foreground">
                  Deposit rupees through Razorpay and receive USDC in your Spot wallet.
                </p>
              </div>
              <CheckoutSteps phase={phase} />

              {phase === "success" ? (
                <Card>
                  <CardHeader className="items-center gap-3 pt-8 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-up/15 text-up">
                      <CircleCheckIcon aria-hidden="true" className="size-7" />
                    </span>
                    <CardTitle className="text-xl">Deposit successful</CardTitle>
                    <CardDescription>
                      {usdcFormatter.format(receive)} USDC is on its way to your Spot wallet.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
                      <SummaryRow label="Amount paid" value={inrFormatter.format(spend)} />
                      <SummaryRow label="USDC received (est.)" value={usdcFormatter.format(receive)} />
                      {paymentId ? (
                        <SummaryRow label="Payment ID" value={<span className="font-mono text-xs">{paymentId}</span>} />
                      ) : null}
                    </dl>
                  </CardContent>
                  <CardFooter className="flex-col gap-2 sm:flex-row">
                    <Button asChild size="lg" className="h-11 w-full sm:flex-1">
                      <Link href="/dashboard">Go to dashboard</Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-11 w-full sm:flex-1" onClick={resetForAnotherDeposit}>
                      Make another deposit
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-5">
                    <FieldGroup className="gap-5">
                      <Field data-invalid={isBelowMin || undefined}>
                        <FieldLabel htmlFor="deposit-amount">You pay</FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start" className="text-xl font-semibold">
                            ₹
                          </InputGroupAddon>
                          <InputGroupInput
                            id="deposit-amount"
                            value={amount}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0"
                            disabled={isBusy}
                            aria-invalid={isBelowMin || undefined}
                            aria-describedby="deposit-amount-hint"
                            onChange={(e) => handleAmountChange(e.target.value)}
                            className="pr-20 pl-9 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
                          />
                          <InputGroupAddon className="text-sm font-medium">INR</InputGroupAddon>
                        </InputGroup>
                        {isBelowMin ? (
                          <FieldError id="deposit-amount-hint">
                            Enter at least {inrFormatter.format(MIN_DEPOSIT)}.
                          </FieldError>
                        ) : (
                          <FieldDescription id="deposit-amount-hint">
                            Minimum deposit {inrFormatter.format(MIN_DEPOSIT)}.
                          </FieldDescription>
                        )}
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          size="sm"
                          value={PRESETS.find((p) => Number(p) === spend) ?? ""}
                          onValueChange={(v) => v && setAmount(v)}
                          disabled={isBusy}
                          aria-label="Quick amounts"
                          className="grid w-full grid-cols-4"
                        >
                          {PRESETS.map((p) => (
                            <ToggleGroupItem key={p} value={p} className="w-full">
                              {presetFormatter.format(Number(p))}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </Field>

                      <div className="relative flex justify-center" aria-hidden="true">
                        <Separator className="absolute inset-x-0 top-1/2" />
                        <span className="relative flex size-9 items-center justify-center rounded-full border bg-card">
                          <ArrowDownIcon className="size-4 text-primary-emphasis" />
                        </span>
                      </div>

                      <Field>
                        <FieldLabel htmlFor="deposit-receive">You receive (estimated)</FieldLabel>
                        <div className="flex h-14 items-center justify-between rounded-lg border bg-muted/40 px-3.5">
                          <output
                            id="deposit-receive"
                            aria-live="polite"
                            className="font-mono text-xl font-semibold tabular-nums"
                          >
                            {usdcFormatter.format(receive)}
                          </output>
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <CoinBadge symbol="USDC" className="size-7 text-[0.55rem]" />
                            USDC
                          </span>
                        </div>
                        <FieldDescription>
                          1 USDC ≈ {inrFormatter.format(USDC_INR_RATE)} · Final amount is set when your order is created.
                        </FieldDescription>
                      </Field>

                      {error ? (
                        <Alert className="flex gap-3 border-destructive/40 bg-destructive/10">
                          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                          <div>
                            <AlertTitle className="text-destructive">Something went wrong</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                          </div>
                        </Alert>
                      ) : null}
                    </FieldGroup>
                  </CardContent>
                  <CardFooter className="flex-col gap-3">
                    <Button
                      size="lg"
                      className="h-12 w-full text-base"
                      disabled={!canPay}
                      onClick={handlePay}
                      onPointerEnter={() => void loadRazorpay()}
                      onFocus={() => void loadRazorpay()}
                    >
                      {isBusy ? <Spinner data-icon="inline-start" /> : <LockIcon data-icon="inline-start" />}
                      {payLabel}
                    </Button>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheckIcon aria-hidden="true" className="size-3.5 text-up" />
                      Payments are processed by Razorpay, a PCI-DSS compliant gateway.
                    </p>
                  </CardFooter>
                </Card>
              )}
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Order summary</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pb-5">
                  <dl className="flex flex-col gap-3">
                    <SummaryRow label="Asset" value="USDC" />
                    <SummaryRow label="Rate" value={`1 USDC ≈ ${inrFormatter.format(USDC_INR_RATE)}`} />
                    <SummaryRow label="Credited to" value="Spot wallet" />
                    <SummaryRow label="You receive (est.)" value={`${usdcFormatter.format(receive)} USDC`} />
                  </dl>
                  <Separator />
                  <dl>
                    <SummaryRow label="Total payable" value={inrFormatter.format(spend)} emphasis />
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-3">
                  <CardTitle className="text-sm">Accepted payment methods</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {METHODS.map((m) => (
                      <Badge key={m.label} variant="outline" className="h-7 gap-1.5 px-2.5">
                        <m.icon aria-hidden="true" />
                        {m.label}
                      </Badge>
                    ))}
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    Your card and UPI details are entered on Razorpay&apos;s secure page and are never stored by Aurax.
                  </CardDescription>
                </CardHeader>
              </Card>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
