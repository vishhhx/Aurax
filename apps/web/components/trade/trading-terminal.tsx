"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { toast } from "sonner"
import { LogInIcon, WifiIcon, WifiOffIcon, XIcon } from "lucide-react"

import CandlestickChart from "@/components/candlestick-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PriceChange } from "@/components/market/market-primitives"
import { useMyOrders } from "@/hooks/useAccount"
import {
  useCandles,
  useConnectionState,
  useMarkets,
  useOrderBook,
  useRecentTrades,
  useTickers,
} from "@/hooks/useMarketData"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { api } from "@/lib/axios"
import { formatCompactNumber, formatDecimal, type Interval, type MarketInfo } from "@/lib/market-client"
import { cn } from "@/lib/utils"
import { selectIsAuthenticated } from "@/store/slices/authSlice"
import { fetchWalletAssets } from "@/store/slices/walletSlice"

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "1d"]
const DEPTH_ROWS = 10

function ConnectionBadge() {
  const state = useConnectionState()
  const live = state === "connected"
  return (
    <Badge variant={live ? "secondary" : "outline"} className="gap-1.5">
      {live ? <WifiIcon aria-hidden="true" /> : <WifiOffIcon aria-hidden="true" />}
      {live ? "Live" : state === "connecting" ? "Connecting" : state === "offline" ? "Offline" : "Reconnecting"}
    </Badge>
  )
}

function MarketHeader({ market, markets, onSelect }: { market: MarketInfo; markets: MarketInfo[]; onSelect: (s: string) => void }) {
  const { tickers } = useTickers([market.symbol])
  const t = tickers.get(market.symbol)
  const p = market.pricePrecision
  const stats: Array<[string, string]> = [
    ["24h high", formatDecimal(t?.highPrice, p)],
    ["24h low", formatDecimal(t?.lowPrice, p)],
    [`24h vol (${market.baseAsset})`, t ? formatCompactNumber(t.volume) : "—"],
    [`24h vol (${market.quoteAsset})`, t ? formatCompactNumber(t.quoteVolume) : "—"],
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <Select value={market.symbol} onValueChange={onSelect}>
          <SelectTrigger aria-label="Select market" className="w-40 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {markets.map((m) => (
                <SelectItem key={m.symbol} value={m.symbol}>
                  {m.baseAsset}/{m.quoteAsset}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div>
          <p className="font-mono text-2xl font-semibold tabular-nums">{t?.lastPrice ? formatDecimal(t.lastPrice, p) : "—"}</p>
          <PriceChange value={t?.priceChangePercent ?? null} className="text-xs" />
        </div>
      </div>
      <dl className="flex flex-wrap gap-6">
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <ConnectionBadge />
    </div>
  )
}

function PriceChart({ market }: { market: MarketInfo }) {
  const [interval, setCandleInterval] = useState<Interval>("1m")
  const { candles, state } = useCandles(market.symbol, interval, 60)
  const points = useMemo(
    () => candles.map((c) => ({ open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) })),
    [candles],
  )
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Price chart</CardTitle>
        <ToggleGroup type="single" size="sm" value={interval} onValueChange={(v) => v && setCandleInterval(v as Interval)} aria-label="Candle interval">
          {INTERVALS.map((i) => (
            <ToggleGroupItem key={i} value={i}>
              {i}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="pb-5">
        {state === "loading" ? (
          <Skeleton className="h-64 w-full" />
        ) : state === "error" ? (
          <Empty className="h-64">
            <EmptyHeader>
              <EmptyTitle>Chart unavailable</EmptyTitle>
              <EmptyDescription>Candles could not be loaded.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : points.length === 0 ? (
          <Empty className="h-64">
            <EmptyHeader>
              <EmptyTitle>No trades yet</EmptyTitle>
              <EmptyDescription>Candles appear once {market.baseAsset}/{market.quoteAsset} trades.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <CandlestickChart candles={points} height={260} />
        )}
      </CardContent>
    </Card>
  )
}

function OrderBookPanel({ market }: { market: MarketInfo }) {
  const book = useOrderBook(market.symbol)
  const p = market.pricePrecision
  const q = market.quantityPrecision
  const asks = book.asks.slice(0, DEPTH_ROWS).reverse()
  const bids = book.bids.slice(0, DEPTH_ROWS)
  const spread = book.asks[0] && book.bids[0] ? Number(book.asks[0].price) - Number(book.bids[0].price) : null

  const Row = ({ price, quantity, side }: { price: string; quantity: string; side: "bid" | "ask" }) => (
    <li className="grid grid-cols-2 font-mono text-xs tabular-nums">
      <span className={side === "bid" ? "text-up" : "text-down"}>{formatDecimal(price, p)}</span>
      <span className="text-right">{formatDecimal(quantity, q)}</span>
    </li>
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Order book</CardTitle>
        {book.status !== "synced" ? <Badge variant="outline">{book.status === "loading" ? "Loading" : "Resyncing"}</Badge> : null}
      </CardHeader>
      <CardContent className="pb-5">
        {book.status === "loading" ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className={cn("flex flex-col gap-2", book.status === "resyncing" && "opacity-50")}>
            <div className="grid grid-cols-2 text-xs text-muted-foreground">
              <span>Price ({market.quoteAsset})</span>
              <span className="text-right">Qty ({market.baseAsset})</span>
            </div>
            {asks.length === 0 && bids.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No resting orders.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-0.5">{asks.map((l) => <Row key={l.price} {...l} side="ask" />)}</ul>
                <p className="border-y py-1 text-center font-mono text-xs text-muted-foreground">
                  Spread {spread === null ? "—" : spread.toFixed(p)}
                </p>
                <ul className="flex flex-col gap-0.5">{bids.map((l) => <Row key={l.price} {...l} side="bid" />)}</ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentTradesPanel({ market }: { market: MarketInfo }) {
  const { trades, state } = useRecentTrades(market.symbol, 30)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recent trades</CardTitle>
      </CardHeader>
      <CardContent className="pb-5">
        {state === "loading" ? (
          <Skeleton className="h-48 w-full" />
        ) : trades.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{state === "error" ? "Trades unavailable." : "No trades yet."}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {trades.map((t) => (
              <li key={t.tradeId} className="grid grid-cols-3 font-mono text-xs tabular-nums">
                <span className={t.side === "BUY" ? "text-up" : "text-down"}>{formatDecimal(t.price, market.pricePrecision)}</span>
                <span className="text-right">{formatDecimal(t.quantity, market.quantityPrecision)}</span>
                <span className="text-right text-muted-foreground">{new Date(t.executedAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function OrderForm({ market }: { market: MarketInfo }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const assets = useAppSelector((s) => s.wallet.assets)
  const [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [type, setType] = useState<"LIMIT" | "MARKET">("LIMIT")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payAsset = side === "BUY" ? market.quoteAsset : market.baseAsset
  const available = assets.find((a) => a.symbol === payAsset)?.availableBalance ?? "0"
  const marketBuy = type === "MARKET" && side === "BUY"

  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Log in to place orders.</p>
          <Button asChild>
            <Link href="/login">
              <LogInIcon data-icon="inline-start" />
              Log in
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post("/api/v1/order", {
        symbol: market.symbol,
        side,
        orderType: type,
        quantity,
        ...(type === "LIMIT" ? { price } : {}),
      })
      toast.success("Order accepted", { description: `${side} ${quantity} ${market.baseAsset}${type === "LIMIT" ? ` @ ${price}` : ""}` })
      setQuantity("")
    } catch (err) {
      const data = axios.isAxiosError(err) ? (err.response?.data as { message?: string; errors?: Array<{ message?: string }> } | undefined) : undefined
      setError(data?.message ?? "Order could not be placed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Tabs value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="BUY">Buy</TabsTrigger>
                <TabsTrigger value="SELL">Sell</TabsTrigger>
              </TabsList>
            </Tabs>
            <ToggleGroup type="single" size="sm" value={type} onValueChange={(v) => v && setType(v as "LIMIT" | "MARKET")} aria-label="Order type">
              <ToggleGroupItem value="LIMIT">Limit</ToggleGroupItem>
              <ToggleGroupItem value="MARKET">Market</ToggleGroupItem>
            </ToggleGroup>
            {type === "LIMIT" ? (
              <Field>
                <FieldLabel htmlFor="order-price">Price ({market.quoteAsset})</FieldLabel>
                <Input id="order-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`tick ${market.tickSize}`} required />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="order-qty">Quantity ({market.baseAsset})</FieldLabel>
              <Input id="order-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={`step ${market.stepSize}`} required />
              <FieldDescription>
                Available: {available} {payAsset}
              </FieldDescription>
            </Field>
            {marketBuy ? <FieldError>Market buys are not supported yet; use a limit order.</FieldError> : null}
            {error ? <FieldError>{error}</FieldError> : null}
            <Button type="submit" disabled={submitting || marketBuy} className={cn("h-10", side === "SELL" && "bg-down text-white hover:bg-down/90")}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {side === "BUY" ? "Buy" : "Sell"} {market.baseAsset}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function AccountPanel({ market }: { market: MarketInfo }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const { openOrders, fills, state, cancel } = useMyOrders(market.symbol)
  if (!isAuthenticated) return null

  const onCancel = async (orderId: string) => {
    try {
      await cancel(orderId)
      toast.info("Cancellation requested")
    } catch (err) {
      const message = axios.isAxiosError(err) ? (err.response?.data as { message?: string })?.message : undefined
      toast.error(message ?? "Cancel failed")
    }
  }

  return (
    <Card className="lg:col-span-3">
      <CardContent className="pt-5">
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">Open orders ({openOrders.length})</TabsTrigger>
            <TabsTrigger value="fills">My trades</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-3">
            {state === "loading" ? (
              <Skeleton className="h-20 w-full" />
            ) : openOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No open orders.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {openOrders.map((o) => (
                  <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className={cn("font-medium", o.side === "BUY" ? "text-up" : "text-down")}>
                      {o.side} {o.orderType}
                    </span>
                    <span className="font-mono tabular-nums">
                      {o.executedQuantity}/{o.quantity} @ {o.price ?? "market"}
                    </span>
                    <Badge variant="outline">{o.status.replace("_", " ").toLowerCase()}</Badge>
                    <Button size="xs" variant="ghost" onClick={() => onCancel(o.orderId)} aria-label={`Cancel order ${o.orderId}`}>
                      <XIcon data-icon="inline-start" />
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="fills" className="mt-3">
            {fills.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No trades yet.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {fills.map((f) => (
                  <li key={f.tradeId} className="grid grid-cols-4 gap-2 py-2 font-mono text-xs tabular-nums">
                    <span className={f.side === "BUY" ? "text-up" : "text-down"}>
                      {f.side} · {f.liquidity.toLowerCase()}
                    </span>
                    <span>{f.quantity} @ {f.price}</span>
                    <span>fee {f.fee}</span>
                    <span className="text-right text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

/** Real-data trading terminal (no simulated prices). */
export function TradingTerminal({ initialSymbol }: { initialSymbol?: string }) {
  const { markets, state, retry } = useMarkets()
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const [symbol, setSymbol] = useState<string | undefined>(initialSymbol)

  useEffect(() => {
    if (isAuthenticated) void dispatch(fetchWalletAssets())
  }, [isAuthenticated, dispatch])

  const market = markets.find((m) => m.symbol === symbol) ?? markets[0]

  if (state === "loading") return <Skeleton className="h-[520px] w-full rounded-xl" />
  if (state === "error" || !market) {
    return (
      <Empty className="rounded-xl border py-16">
        <EmptyHeader>
          <EmptyTitle>{state === "error" ? "Trading is unavailable" : "No markets listed"}</EmptyTitle>
          <EmptyDescription>{state === "error" ? "The market service could not be reached." : "Markets appear here once they are enabled."}</EmptyDescription>
        </EmptyHeader>
        {state === "error" ? (
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <MarketHeader market={market} markets={markets} onSelect={setSymbol} />
      <div className="grid gap-4 lg:grid-cols-3">
        <PriceChart market={market} />
        <OrderBookPanel market={market} />
        <RecentTradesPanel market={market} />
        <OrderForm market={market} />
        <div className="hidden lg:block" />
        <AccountPanel market={market} />
      </div>
    </div>
  )
}
