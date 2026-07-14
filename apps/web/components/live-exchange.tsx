"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import CandlestickChart, { Candle } from "./candlestick-chart"
import { Separator } from "@/components/ui/separator"

export type TradeRecord = {
  id: string
  time: string
  side: "buy" | "sell"
  price: number
  size: number
}

type LiveExchangeProps = {
  onTradeExecuted?: (trade: { side: "buy" | "sell"; price: number; size: number }) => void
}

// Helper to generate 45 initial continuous candles
const generateInitialCandles = () => {
  const list: Candle[] = []
  let close = 12.10
  for (let i = 0; i < 45; i++) {
    const open = close
    const change = (Math.random() - 0.47) * 0.22
    close = Number((open + change).toFixed(2))
    const high = Number((Math.max(open, close) + Math.random() * 0.1).toFixed(2))
    const low = Number((Math.min(open, close) - Math.random() * 0.1).toFixed(2))
    list.push({ open, high, low, close })
  }
  return list
}

export default function LiveExchange({ onTradeExecuted }: LiveExchangeProps) {
  // Live Price State for AURX
  const [price, setPrice] = useState(12.34)
  const [prevPrice, setPrevPrice] = useState(12.34)
  const [dailyChange, setDailyChange] = useState(2.3)
  const [high, setHigh] = useState(12.85)
  const [low, setLow] = useState(11.90)
  const [volume, setVolume] = useState(384210)

  // Wallet State
  const [usdBalance, setUsdBalance] = useState(1500.0)
  const [aurxBalance, setAurxBalance] = useState(120.0)

  // Form State
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy")
  const [orderType, setOrderType] = useState<"market" | "limit">("market")
  const [limitPrice, setLimitPrice] = useState("12.34")
  const [amount, setAmount] = useState("10")

  // Candlestick history state
  const [candleHistory, setCandleHistory] = useState<Candle[]>(() => generateInitialCandles())

  // Keep track of ticks to decide when to roll a new candle (every 5 ticks = 12.5s)
  const tickCounterRef = useRef(0)

  // Recent Trades State
  const [recentTrades, setRecentTrades] = useState<TradeRecord[]>(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: `initial-trade-${i}`,
      time: new Date(Date.now() - i * 60000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      side: Math.random() > 0.5 ? "buy" : "sell",
      price: Number((12.3 + Math.random() * 0.1).toFixed(2)),
      size: Number((Math.random() * 80 + 5).toFixed(2)),
    }))
  })

  // Simulated Order Book State
  const [orderBook, setOrderBook] = useState<{
    asks: { price: number; size: number; total: number }[]
    bids: { price: number; size: number; total: number }[]
  }>({ asks: [], bids: [] })

  // Trigger flash animations on update
  const [flashBook, setFlashBook] = useState<"asks" | "bids" | null>(null)

  // Helper to calculate totals for orderbook
  const generateOrderBook = (currentPrice: number) => {
    const askList = []
    const bidList = []
    let askTotal = 0
    let bidTotal = 0

    for (let i = 0; i < 6; i++) {
      const askPrice = currentPrice + (i + 1) * 0.02 + (Math.random() - 0.5) * 0.01
      const askSize = Math.random() * 500 + 50
      askTotal += askSize
      askList.push({
        price: Number(askPrice.toFixed(2)),
        size: Number(askSize.toFixed(1)),
        total: Number(askTotal.toFixed(1)),
      })

      const bidPrice = currentPrice - (i + 1) * 0.02 + (Math.random() - 0.5) * 0.01
      const bidSize = Math.random() * 500 + 50
      bidTotal += bidSize
      bidList.push({
        price: Number(bidPrice.toFixed(2)),
        size: Number(bidSize.toFixed(1)),
        total: Number(bidTotal.toFixed(1)),
      })
    }

    return { asks: askList.reverse(), bids: bidList }
  }

  // Initialize Orderbook
  useEffect(() => {
    setOrderBook(generateOrderBook(price))
  }, [])

  // Live simulation tick interval
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate price fluctuation
      setPrice((currentPrice) => {
        setPrevPrice(currentPrice)
        const tick = (Math.random() - 0.5) * 0.06 // random tick up or down
        let newPrice = Number((currentPrice + tick).toFixed(2))
        if (newPrice < 5) newPrice = 5 // hard floor

        // Update high/low/volume
        if (newPrice > high) setHigh(newPrice)
        if (newPrice < low) setLow(newPrice)
        setVolume((v) => v + Math.floor(Math.random() * 12))

        // Update daily change percent based on a baseline of $12.00
        const changePercent = ((newPrice - 12.0) / 12.0) * 100
        setDailyChange(Number(changePercent.toFixed(2)))

        // Update candlestick history
        setCandleHistory((candles) => {
          const nextCandles = [...candles]
          const lastIdx = nextCandles.length - 1
          if (lastIdx < 0) return nextCandles

          tickCounterRef.current += 1
          if (tickCounterRef.current >= 5) {
            // Commit current candle and roll a new one
            tickCounterRef.current = 0
            const lastClose = nextCandles[lastIdx].close
            const newCandle = {
              open: lastClose,
              high: Math.max(lastClose, newPrice),
              low: Math.min(lastClose, newPrice),
              close: newPrice,
            }
            return [...nextCandles.slice(1), newCandle]
          } else {
            // Update existing candle
            const lastCandle = { ...nextCandles[lastIdx] }
            lastCandle.close = newPrice
            lastCandle.high = Number(Math.max(lastCandle.high, newPrice).toFixed(2))
            lastCandle.low = Number(Math.min(lastCandle.low, newPrice).toFixed(2))
            nextCandles[lastIdx] = lastCandle
            return nextCandles
          }
        })

        // Maybe trigger a simulated recent trade
        if (Math.random() > 0.4) {
          const tradeSize = Number((Math.random() * 150 + 2).toFixed(2))
          const side = tick >= 0 ? "buy" : "sell"
          const newTrade: TradeRecord = {
            id: `trade-${Date.now()}`,
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            side,
            price: newPrice,
            size: tradeSize,
          }
          setRecentTrades((trades) => [newTrade, ...trades.slice(0, 9)])
        }

        // Regenerate or update orderbook slightly
        setOrderBook((currentBook) => {
          const updatedAsks = currentBook.asks.map((a) => {
            const priceMod = (Math.random() - 0.5) * 0.02
            const sizeMod = (Math.random() - 0.5) * 20
            return {
              price: Number(Math.max(newPrice + 0.01, a.price + priceMod).toFixed(2)),
              size: Number(Math.max(10, a.size + sizeMod).toFixed(1)),
              total: 0,
            }
          })
          const updatedBids = currentBook.bids.map((b) => {
            const priceMod = (Math.random() - 0.5) * 0.02
            const sizeMod = (Math.random() - 0.5) * 20
            return {
              price: Number(Math.min(newPrice - 0.01, b.price + priceMod).toFixed(2)),
              size: Number(Math.max(10, b.size + sizeMod).toFixed(1)),
              total: 0,
            }
          })

          // Recalculate totals
          let askTotal = 0
          updatedAsks.reverse().forEach((a) => {
            askTotal += a.size
            a.total = Number(askTotal.toFixed(1))
          })
          updatedAsks.reverse()

          let bidTotal = 0
          updatedBids.forEach((b) => {
            bidTotal += b.size
            b.total = Number(bidTotal.toFixed(1))
          })

          setFlashBook(Math.random() > 0.5 ? "asks" : "bids")
          setTimeout(() => setFlashBook(null), 150)

          return { asks: updatedAsks, bids: updatedBids }
        })

        return newPrice
      })
    }, 2500)

    return () => clearInterval(interval)
  }, [high, low])

  // Form total calculations
  const parsedAmount = parseFloat(amount) || 0
  const parsedLimit = parseFloat(limitPrice) || 0
  const orderPrice = orderType === "market" ? price : parsedLimit
  const orderTotal = Number((parsedAmount * orderPrice).toFixed(2))

  // Execute buy or sell order
  const handleExecuteOrder = (e: React.FormEvent) => {
    e.preventDefault()
    if (parsedAmount <= 0) return

    let nextPrice = price
    if (tradeType === "buy") {
      if (orderTotal > usdBalance) {
        alert("Insufficient USD balance.")
        return
      }
      setUsdBalance((b) => Number((b - orderTotal).toFixed(2)))
      setAurxBalance((b) => Number((b + parsedAmount).toFixed(4)))

      // Push price up slightly due to demand
      nextPrice = Number((price + 0.04).toFixed(2))
    } else {
      if (parsedAmount > aurxBalance) {
        alert("Insufficient AURX balance.")
        return
      }
      setAurxBalance((b) => Number((b - parsedAmount).toFixed(4)))
      setUsdBalance((b) => Number((b + orderTotal).toFixed(2)))

      // Pull price down slightly due to supply
      nextPrice = Number((price - 0.04).toFixed(2))
    }

    setPrice(nextPrice)

    // Sync to candlestick history immediately
    setCandleHistory((candles) => {
      const nextCandles = [...candles]
      const lastIdx = nextCandles.length - 1
      if (lastIdx >= 0) {
        const lastCandle = { ...nextCandles[lastIdx] }
        lastCandle.close = nextPrice
        lastCandle.high = Number(Math.max(lastCandle.high, nextPrice).toFixed(2))
        lastCandle.low = Number(Math.min(lastCandle.low, nextPrice).toFixed(2))
        nextCandles[lastIdx] = lastCandle
      }
      return nextCandles
    })

    // Insert to recent trades
    const userTradePrice = Number(orderPrice.toFixed(2))
    const userTradeRecord: TradeRecord = {
      id: `user-trade-${Date.now()}`,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      side: tradeType,
      price: userTradePrice,
      size: parsedAmount,
    }

    setRecentTrades((trades) => [userTradeRecord, ...trades.slice(0, 9)])

    // Call chat update trigger
    if (onTradeExecuted) {
      onTradeExecuted({
        side: tradeType,
        price: userTradePrice,
        size: parsedAmount,
      })
    }
  }

  // Pre-fill amount shortcuts
  const handlePercentShortcut = (pct: number) => {
    if (tradeType === "buy") {
      const maxBuyAmount = usdBalance / orderPrice
      setAmount((maxBuyAmount * pct).toFixed(2))
    } else {
      setAmount((aurxBalance * pct).toFixed(2))
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Ticker Detail Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/25 p-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400 font-bold border border-emerald-500/20 text-sm">
            AURX
          </div>
          <div>
            <h2 className="text-xl font-bold">AURX / USD</h2>
            <p className="text-xs text-muted-foreground">Aurax Centralized Exchange</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Last Price</span>
            <span className={`text-xl font-extrabold transition-all duration-300 ${
              price > prevPrice ? "text-emerald-400" : price < prevPrice ? "text-rose-400" : "text-foreground"
            }`}>
              ${price.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">24h Change</span>
            <span className={`text-sm font-bold ${dailyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {dailyChange >= 0 ? "+" : ""}{dailyChange}%
            </span>
          </div>

          <div className="hidden flex-col sm:flex">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">24h High</span>
            <span className="text-sm font-semibold">${high.toFixed(2)}</span>
          </div>

          <div className="hidden flex-col sm:flex">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">24h Low</span>
            <span className="text-sm font-semibold">${low.toFixed(2)}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">24h Vol (AURX)</span>
            <span className="text-sm font-semibold">{volume.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Grid: Candlestick Chart, Orderbook, Forms (Properly Spaced 4-column layout) */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Main Candlestick Chart Section (span 3) */}
        <div className="lg:col-span-3 flex flex-col gap-4 rounded-xl border border-border/50 bg-card/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Candlestick Chart</h3>
              <Badge variant="outline" className="text-[9px] py-0 px-1 border-border/50 text-emerald-400 bg-emerald-500/5">
                AURX/USD 2.5s Ticks
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-xs text-muted-foreground">Live Feed</span>
            </div>
          </div>

          {/* Render CandlestickChart */}
          <div className="h-[280px] w-full flex items-end justify-center py-2 relative bg-background/5 rounded-lg border border-border/30 px-2 overflow-hidden">
            <CandlestickChart candles={candleHistory} width={620} height={260} />
          </div>

          <Separator className="bg-border/30" />

          {/* Trade Simulation Panel & Wallet Info */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Simulated Order Console</h4>
              <div className="flex gap-2 bg-muted/40 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTradeType("buy")}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                    tradeType === "buy" ? "bg-emerald-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Buy AURX
                </button>
                <button
                  type="button"
                  onClick={() => setTradeType("sell")}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                    tradeType === "sell" ? "bg-rose-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sell AURX
                </button>
              </div>

              <form onSubmit={handleExecuteOrder} className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Order Mode</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOrderType("market")}
                      className={`px-1.5 py-0.5 rounded transition ${
                        orderType === "market" ? "text-foreground bg-muted font-medium" : "hover:text-foreground"
                      }`}
                    >
                      Market
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType("limit")}
                      className={`px-1.5 py-0.5 rounded transition ${
                        orderType === "limit" ? "text-foreground bg-muted font-medium" : "hover:text-foreground"
                      }`}
                    >
                      Limit
                    </button>
                  </div>
                </div>

                {orderType === "limit" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Limit Price (USD)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="h-8 text-xs bg-muted/20 border-border/60"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <label className="text-muted-foreground">Amount (AURX)</label>
                    <span className="text-[10px] text-muted-foreground/80">
                      Max: {tradeType === "buy" ? `${(usdBalance / orderPrice).toFixed(1)} AURX` : `${aurxBalance.toFixed(2)} AURX`}
                    </span>
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-8 text-xs bg-muted/20 border-border/60"
                  />
                </div>

                {/* Percentage Shortcuts */}
                <div className="flex gap-2">
                  {[0.25, 0.5, 0.75, 1.0].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handlePercentShortcut(val)}
                      className="flex-1 text-[10px] py-1 border border-border/40 rounded bg-card/25 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                    >
                      {val * 100}%
                    </button>
                  ))}
                </div>

                <div className="mt-1 text-xs flex justify-between border-t border-border/30 pt-2.5">
                  <span className="text-muted-foreground">Est. Total:</span>
                  <span className="font-bold">${orderTotal.toLocaleString()} USD</span>
                </div>

                <Button
                  type="submit"
                  variant={tradeType === "buy" ? "default" : "outline"}
                  className={`w-full text-xs font-semibold h-8 mt-1 transition-all cursor-pointer ${
                    tradeType === "buy"
                      ? "bg-emerald-500 hover:bg-emerald-600 border-none text-white"
                      : "border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/20"
                  }`}
                >
                  Place {tradeType === "buy" ? "Buy" : "Sell"} Order
                </Button>
              </form>
            </div>

            {/* Balances & Wallet Simulator */}
            <div className="flex flex-col justify-between rounded-xl border border-border/30 bg-muted/10 p-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Simulated Wallet</h4>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-border/30 pb-2">
                    <span className="text-xs text-muted-foreground">USD Cash</span>
                    <span className="text-sm font-semibold text-emerald-400">${usdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/30 pb-2">
                    <span className="text-xs text-muted-foreground">AURX Token</span>
                    <span className="text-sm font-semibold">{aurxBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} AURX</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Estimate</span>
                    <span className="text-sm font-bold">${(usdBalance + aurxBalance * price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-2.5 rounded bg-card/45 border border-border/20 text-[11px] text-muted-foreground leading-relaxed">
                🚀 This is a virtual portfolio. Execute buy/sell orders above to see the price candles adjust and create live candlestick swings!
              </div>
            </div>
          </div>
        </div>

        {/* Order Book & Recent Trades Panel (span 1) */}
        <div className="lg:col-span-1 flex flex-col gap-5 rounded-xl border border-border/50 bg-card/10 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Order Book</h3>
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-border/60">Depth</Badge>
          </div>

          <div className="flex flex-col gap-1 text-[11px]">
            {/* Headers */}
            <div className="grid grid-cols-3 text-muted-foreground border-b border-border/30 pb-1.5 px-1 font-semibold uppercase tracking-wider">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Total</span>
            </div>

            {/* Asks (Sells) - Red */}
            <div className={`flex flex-col gap-1 transition-colors duration-200 ${flashBook === "asks" ? "bg-rose-500/5" : ""}`}>
              {orderBook.asks.map((a, i) => (
                <div key={`ask-${i}`} className="grid grid-cols-3 hover:bg-muted/30 py-0.5 rounded px-1 transition-colors">
                  <span className="text-rose-400 font-medium">${a.price.toFixed(2)}</span>
                  <span className="text-right text-muted-foreground/80">{a.size.toLocaleString()}</span>
                  <span className="text-right text-muted-foreground/60">{a.total.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Spread Indicator */}
            <div className="flex items-center justify-between border-y border-border/30 my-1 py-1 px-1 font-semibold bg-muted/10">
              <span className="text-foreground text-[12px] font-bold">${price.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground">
                Spread: ${(orderBook.asks[orderBook.asks.length - 1]?.price - orderBook.bids[0]?.price || 0.04).toFixed(2)}
              </span>
            </div>

            {/* Bids (Buys) - Green */}
            <div className={`flex flex-col gap-1 transition-colors duration-200 ${flashBook === "bids" ? "bg-emerald-500/5" : ""}`}>
              {orderBook.bids.map((b, i) => (
                <div key={`bid-${i}`} className="grid grid-cols-3 hover:bg-muted/30 py-0.5 rounded px-1 transition-colors">
                  <span className="text-emerald-400 font-medium">${b.price.toFixed(2)}</span>
                  <span className="text-right text-muted-foreground/80">{b.size.toLocaleString()}</span>
                  <span className="text-right text-muted-foreground/60">{b.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* Recent Trades panel */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Trades</h4>
            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto text-[11px] pr-1">
              {recentTrades.map((t) => (
                <div key={t.id} className="flex justify-between items-center py-0.5 hover:bg-muted/30 rounded px-1 transition-colors">
                  <span className={`${t.side === "buy" ? "text-emerald-400" : "text-rose-400"} capitalize font-semibold`}>
                    {t.side} {t.size.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground">${t.price.toFixed(2)}</span>
                  <span className="text-muted-foreground/40 text-[9px]">{t.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
