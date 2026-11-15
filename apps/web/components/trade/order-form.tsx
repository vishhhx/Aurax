"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { InfoIcon } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-account"
import { useOrderBook } from "@/hooks/use-market-data"
import { usePlaceOrder } from "@/hooks/use-orders"
import { useAppSelector } from "@/hooks/useRedux"
import { ApiError } from "@/lib/api/client"
import type { OrderType, Side, TimeInForce } from "@/lib/api/types"
import * as D from "@/lib/decimal"
import { formatAmount, formatFeeRate } from "@/lib/format"
import { canPlaceOrders, checkDraft, estimateMarketFill, maxFeeRate, quantityForFraction, type DraftField } from "@/lib/trading/order-rules"
import { DEFAULT_PREFERENCES, preferencesStore } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"
import { useTerminal } from "./terminal-context"

const FRACTIONS = [
  { label: "25%", value: "0.25" },
  { label: "50%", value: "0.5" },
  { label: "75%", value: "0.75" },
  { label: "Max", value: "1" },
] as const

const TIF_LABEL: Record<TimeInForce, string> = { GTC: "Good till cancelled", IOC: "Immediate or cancel", FOK: "Fill or kill" }

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        {label}
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`About ${label}`} className="text-muted-foreground">
                <InfoIcon className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className="num text-right">{children}</span>
    </div>
  )
}

/** Server errors: field rules (TICK_SIZE, STEP_SIZE, MIN_NOTIONAL…) go next to the field, the rest above submit. */
function serverErrors(e: ApiError): Partial<Record<DraftField, string>> {
  const out: Partial<Record<DraftField, string>> = {}
  for (const i of e.issues) {
    if (i.field === "price") out.price ??= e.issues.length === 1 ? e.message : (i.message ?? e.message)
    else if (i.field === "quantity") out.quantity ??= e.issues.length === 1 ? e.message : (i.message ?? e.message)
  }
  if (!out.price && !out.quantity) out.form = e.message
  // Rule codes are terse; the top-level message is the readable one.
  if (out.price && /^[A-Z_]+$/.test(out.price)) out.price = e.message
  if (out.quantity && /^[A-Z_]+$/.test(out.quantity)) out.quantity = e.message
  return out
}

export function OrderForm({ className }: { className?: string }) {
  const { market, pick } = useTerminal()
  const pathname = usePathname()
  const { isAuthenticated, isPending } = useAuth()
  const assets = useAppSelector((s) => s.wallet.assets)
  const walletStatus = useAppSelector((s) => s.wallet.status)
  const confirmOrders = useSyncExternalStore(preferencesStore.subscribe, () => preferencesStore.get().confirmOrders, () => DEFAULT_PREFERENCES.confirmOrders)
  const book = useOrderBook(market.symbol)
  const place = usePlaceOrder()

  const [side, setSide] = useState<Side>("BUY")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("")
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC")
  const [postOnly, setPostOnly] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [remote, setRemote] = useState<Partial<Record<DraftField, string>>>({})
  const [confirming, setConfirming] = useState(false)

  // Reset when the market changes.
  const [forSymbol, setForSymbol] = useState(market.symbol)
  if (forSymbol !== market.symbol) {
    setForSymbol(market.symbol)
    setPrice("")
    setQuantity("")
    setRemote({})
    setSubmitted(false)
  }

  // A price picked from the book or trades.
  const [pickSeen, setPickSeen] = useState(0)
  if (pick && pick.nonce !== pickSeen) {
    setPickSeen(pick.nonce)
    setOrderType("LIMIT")
    setPrice(pick.price)
    setRemote({})
  }

  const payAsset = side === "BUY" ? market.quoteAsset : market.baseAsset
  const available = assets.find((a) => a.symbol === payAsset)?.availableBalance ?? null
  const isLimit = orderType === "LIMIT"

  const check = useMemo(
    () => checkDraft(market, { side, orderType, price, quantity, timeInForce: isLimit ? timeInForce : "IOC", postOnly: isLimit && postOnly }, isAuthenticated ? available : null, submitted),
    [market, side, orderType, price, quantity, timeInForce, postOnly, isLimit, available, isAuthenticated, submitted],
  )
  const errors = { ...check.errors, ...remote }

  const bestAsk = book.asks[0]?.price
  const bestBid = book.bids[0]?.price
  const normQty = D.normalizeInput(quantity)
  const marketEstimate = !isLimit && side === "SELL" && normQty ? estimateMarketFill(book.bids, normQty, market.pricePrecision) : null

  const onNumber = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(",", ".")
    if (D.isDecimalInput(v)) {
      set(v)
      setRemote({})
    }
  }

  const applyFraction = (fraction: string) => {
    if (!available) return
    const ref = isLimit ? D.normalizeInput(price) : null
    const q = quantityForFraction(market, side, available, fraction, side === "BUY" ? ref : null)
    if (q) setQuantity(q)
    else toast.info(side === "BUY" && !ref ? "Enter a price first" : `Not enough ${payAsset} for the minimum step`)
  }

  const submit = async () => {
    if (!check.request) return
    setSubmitting(true)
    setRemote({})
    try {
      const res = await place(check.request)
      toast.success("Order submitted", {
        description: `${side === "BUY" ? "Buy" : "Sell"} ${D.normalize(res.order.quantity)} ${market.baseAsset}${res.order.price ? ` @ ${D.normalize(res.order.price)}` : " at market"} — pending matching engine`,
      })
      setQuantity("")
      setSubmitted(false)
    } catch (err) {
      setRemote(serverErrors(err as ApiError))
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!check.request) return
    if (confirmOrders) setConfirming(true)
    else void submit()
  }

  const tradable = canPlaceOrders(market)
  const marketBuy = !isLimit && side === "BUY"

  return (
    <section aria-label="Place order" className={cn("flex flex-col rounded-xl border bg-panel glass-edge", className)}>
      <div className="grid grid-cols-2 gap-1 p-2">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => {
              setSide(s)
              setRemote({})
            }}
            className={cn(
              "h-8 rounded-md text-sm font-medium transition-colors",
              side === s ? (s === "BUY" ? "bg-up text-up-foreground" : "bg-down text-down-foreground") : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "BUY" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 px-3 pb-3">
        <ToggleGroup type="single" size="sm" value={orderType} onValueChange={(v) => v && (setOrderType(v as OrderType), v === "MARKET" && setPostOnly(false), setRemote({}))} aria-label="Order type" className="justify-start">
          <ToggleGroupItem value="LIMIT">Limit</ToggleGroupItem>
          <ToggleGroupItem value="MARKET">Market</ToggleGroupItem>
        </ToggleGroup>

        <FieldGroup className="gap-3">
          {isLimit ? (
            <Field data-invalid={errors.price ? true : undefined} className="gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="order-price" className="text-xs text-muted-foreground">
                  Price
                </FieldLabel>
                <div className="flex gap-1">
                  {bestBid ? (
                    <Button type="button" variant="ghost" size="xs" onClick={() => setPrice(bestBid)}>
                      Bid
                    </Button>
                  ) : null}
                  {bestAsk ? (
                    <Button type="button" variant="ghost" size="xs" onClick={() => setPrice(bestAsk)}>
                      Ask
                    </Button>
                  ) : null}
                </div>
              </div>
              <InputGroup>
                <InputGroupInput
                  id="order-price"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={`Tick ${D.normalize(market.tickSize)}`}
                  value={price}
                  onChange={onNumber(setPrice)}
                  aria-invalid={errors.price ? true : undefined}
                  aria-describedby={errors.price ? "order-price-error" : undefined}
                  className="num"
                />
                <InputGroupAddon align="inline-end" className="text-xs">
                  {market.quoteAsset}
                </InputGroupAddon>
              </InputGroup>
              {errors.price ? <FieldError id="order-price-error" className="text-xs">{errors.price}</FieldError> : null}
            </Field>
          ) : (
            <div className="flex h-9 items-center justify-between rounded-md border border-dashed px-3 text-xs text-muted-foreground">
              <span>Price</span>
              <span>Best available</span>
            </div>
          )}

          <Field data-invalid={errors.quantity ? true : undefined} className="gap-1.5">
            <FieldLabel htmlFor="order-qty" className="text-xs text-muted-foreground">
              Amount
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="order-qty"
                inputMode="decimal"
                autoComplete="off"
                placeholder={`Min ${D.normalize(market.minQuantity)}`}
                value={quantity}
                onChange={onNumber(setQuantity)}
                aria-invalid={errors.quantity ? true : undefined}
                aria-describedby={errors.quantity ? "order-qty-error" : undefined}
                className="num"
              />
              <InputGroupAddon align="inline-end" className="text-xs">
                {market.baseAsset}
              </InputGroupAddon>
            </InputGroup>
            {errors.quantity ? <FieldError id="order-qty-error" className="text-xs">{errors.quantity}</FieldError> : null}
          </Field>
        </FieldGroup>

        {isAuthenticated ? (
          <ToggleGroup type="single" variant="outline" size="sm" value="" onValueChange={(v) => v && applyFraction(v)} aria-label="Use a share of available balance" className="grid w-full grid-cols-4" disabled={!available || D.isZero(available) || marketBuy}>
            {FRACTIONS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="w-full text-xs">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}

        {isLimit ? (
          <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="order-tif" className="flex items-center gap-1 text-xs text-muted-foreground">
                Time in force
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label="About time in force">
                      <InfoIcon className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">GTC rests on the book until filled or cancelled. IOC fills what it can immediately and cancels the rest. FOK fills completely at once or not at all.</TooltipContent>
                </Tooltip>
              </Label>
              <Select value={timeInForce} onValueChange={(v) => (setTimeInForce(v as TimeInForce), v !== "GTC" && setPostOnly(false))}>
                <SelectTrigger id="order-tif" size="sm" className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(TIF_LABEL) as TimeInForce[]).map((t) => (
                      <SelectItem key={t} value={t} className="text-xs" title={TIF_LABEL[t]}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="order-post-only" className="text-xs text-muted-foreground">
                Post only
              </Label>
              <Switch id="order-post-only" size="sm" checked={postOnly} disabled={timeInForce !== "GTC"} onCheckedChange={setPostOnly} />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 border-t pt-3">
          <Row label="Available">
            {isAuthenticated ? (walletStatus === "ready" ? `${formatAmount(available ?? "0", 8, { trim: true })} ${payAsset}` : "…") : "—"}
          </Row>
          {isLimit ? (
            <>
              <Row label="Order value">{check.notional ? `${formatAmount(check.notional, market.pricePrecision)} ${market.quoteAsset}` : "—"}</Row>
              <Row label="Max fee" hint={`Maker ${formatFeeRate(market.makerFee)} · taker ${formatFeeRate(market.takerFee)}. Fees are charged in ${market.quoteAsset}; the final fee depends on whether the order makes or takes liquidity.`}>
                {check.maxFee ? `${formatAmount(check.maxFee, 8, { trim: true })} ${market.quoteAsset}` : formatFeeRate(maxFeeRate(market))}
              </Row>
            </>
          ) : marketEstimate ? (
            <Row label="Est. proceeds" hint="Estimated from the visible order book now; the engine fills against the book at execution time.">
              {formatAmount(marketEstimate.quote, market.pricePrecision)} {market.quoteAsset}
              {marketEstimate.partial ? <span className="text-warning"> (book too thin)</span> : null}
            </Row>
          ) : null}
          {check.reservation ? (
            <Row label="Will lock" hint="Reserved from your available balance while the order is open. Unused funds are released when it fills or is cancelled.">
              {formatAmount(check.reservation.amount, 8, { trim: true })} {check.reservation.asset}
            </Row>
          ) : null}
        </div>

        {marketBuy ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            <p>Market buy orders are not supported yet: the engine cannot cap how much {market.quoteAsset} a market buy spends.</p>
            {bestAsk ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="w-fit"
                onClick={() => {
                  setOrderType("LIMIT")
                  setTimeInForce("IOC")
                  setPostOnly(false)
                  setPrice(bestAsk)
                }}
              >
                Use limit IOC at best ask ({formatAmount(bestAsk, market.pricePrecision)})
              </Button>
            ) : null}
          </div>
        ) : errors.form ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.form}
          </p>
        ) : null}

        {isPending ? (
          <Button type="button" disabled className="h-9">
            <Spinner data-icon="inline-start" />
            Checking session
          </Button>
        ) : isAuthenticated ? (
          <Button
            type="submit"
            disabled={submitting || !tradable || marketBuy}
            className={cn("h-9 font-medium", side === "BUY" ? "bg-up text-up-foreground hover:bg-up/90" : "bg-down text-down-foreground hover:bg-down/90")}
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {side === "BUY" ? "Buy" : "Sell"} {market.baseAsset}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild className="h-9">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in to trade</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/register">Create account</Link>
            </Button>
          </div>
        )}
        {isAuthenticated && available !== null && D.isZero(available) && walletStatus === "ready" ? (
          <p className="text-xs text-muted-foreground">
            No {payAsset} available.{" "}
            {payAsset === "USDC" ? (
              <Link href="/wallet/deposit" className="text-foreground underline-offset-2 hover:underline">
                Deposit
              </Link>
            ) : null}
          </p>
        ) : null}
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {side === "BUY" ? "buy" : "sell"} {market.baseAsset}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-1.5 text-sm">
                <span>
                  {isLimit ? `Limit ${timeInForce}${postOnly ? " post-only" : ""}` : "Market (IOC)"} · {check.request ? D.normalize(check.request.quantity) : ""} {market.baseAsset}
                  {check.request?.price ? ` @ ${D.normalize(check.request.price)} ${market.quoteAsset}` : ""}
                </span>
                {check.reservation ? (
                  <span>
                    Locks {formatAmount(check.reservation.amount, 8, { trim: true })} {check.reservation.asset} until the order closes.
                  </span>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Place order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
