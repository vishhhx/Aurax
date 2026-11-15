import { describe, expect, test } from "bun:test"
import { candleFrom, canonicalSymbol, tickerFromRest, tickerFromStream, tradeFromRest, tradeFromStream } from "@/lib/api/market"
import { mergeTicker } from "@/lib/stores/market-store"
import { mergeTrades, upsertCandles } from "@/hooks/use-market-data"
import { direction, formatAmount, formatCompact, formatFeeRate, formatPercent } from "@/lib/format"
import { portfolioValue } from "@/lib/trading/valuation"
import { safeNextPath } from "@/lib/auth/redirect"
import { withCumulative } from "@/components/trade/order-book"
import { asset } from "./fixtures"

describe("REST and WebSocket shapes normalise to one model", () => {
  test("tickers", () => {
    const rest = tickerFromRest({ symbol: "BTCUSDC", lastPrice: "65000", openPrice: "64000", highPrice: "65500", lowPrice: "63900", priceChange: "1000", priceChangePercent: "1.5625", volume: "1.2", quoteVolume: "78000", tradeCount: 42, lastTradeTimestamp: 10, updatedAt: 20 })
    const ws = tickerFromStream(
      "BTCUSDC",
      { lastPrice: "65000", openPrice24h: "64000", high24h: "65500", low24h: "63900", priceChange24h: "1000", priceChangePercent24h: "1.5625", baseVolume24h: "1.2", quoteVolume24h: "78000", tradeCount24h: 42, lastTradeTimestamp: 10 },
      20,
    )
    expect(ws).toEqual(rest)
  })

  test("trades map timestamp/executedAt", () => {
    const rest = tradeFromRest({ tradeId: "t1", price: "1", quantity: "2", quoteQuantity: "2", side: "SELL", timestamp: 5 })
    const ws = tradeFromStream({ tradeId: "t1", price: "1", quantity: "2", quoteQuantity: "2", side: "SELL", executedAt: 5 })
    expect(ws).toEqual(rest)
  })

  test("symbols", () => {
    expect(canonicalSymbol("btc-usdc")).toBe("BTCUSDC")
    expect(canonicalSymbol("BTC%2FUSDC")).toBe("BTCUSDC")
  })
})

describe("merging live data", () => {
  test("tickers only move forward", () => {
    const base = { status: "ready" as const, bySymbol: {} }
    const t = (lastPrice: string, updatedAt: number) => tickerFromRest({ symbol: "X", lastPrice, updatedAt, lastTradeTimestamp: updatedAt })
    let s = mergeTicker(base, t("2", 200))
    s = mergeTicker(s, t("1", 100))
    expect(s.bySymbol.X!.lastPrice).toBe("2")
    s = mergeTicker(s, t("3", 300))
    expect(s.bySymbol.X!.lastPrice).toBe("3")
  })

  test("trades deduplicate by tradeId, newest first, bounded", () => {
    const tr = (id: string, at: number) => tradeFromRest({ tradeId: id, price: "1", quantity: "1", side: "BUY", timestamp: at })
    const merged = mergeTrades([tr("a", 1), tr("b", 2)], [tr("b", 2), tr("c", 3)], 2)
    expect(merged.map((t) => t.tradeId)).toEqual(["c", "b"])
  })

  test("candles replace by openTime and never regress", () => {
    const c = (openTime: number, close: string, tradeCount: number, isClosed = false) => candleFrom({ openTime, closeTime: openTime + 59_999, open: "1", high: "2", low: "1", close, baseVolume: "1", quoteVolume: "1", tradeCount, isClosed })
    let list = upsertCandles([], [c(0, "1", 1, true), c(60_000, "1.5", 3)], 10)
    list = upsertCandles(list, [c(60_000, "1.2", 2)], 10) // stale REST copy of the live candle
    expect(list[1]!.close).toBe("1.5")
    list = upsertCandles(list, [c(60_000, "1.7", 4), c(120_000, "1.8", 1)], 2)
    expect(list.map((x) => x.close)).toEqual(["1.7", "1.8"])
  })
})

describe("formatting", () => {
  test("amounts are grouped and rounded on the string", () => {
    expect(formatAmount("1234567.891", 2)).toBe("1,234,567.89")
    expect(formatAmount("0.1", 4)).toBe("0.1000")
    expect(formatAmount("12.3400", 8, { trim: true })).toBe("12.34")
    expect(formatAmount("5", 2, { sign: true })).toBe("+5.00")
    expect(formatAmount(null, 2)).toBe("—")
    expect(formatAmount("99999999999999999.99", 2)).toBe("99,999,999,999,999,999.99")
  })
  test("percent, fee, compact and direction", () => {
    expect(formatPercent("1.5625")).toBe("+1.56%")
    expect(formatPercent("-0.004")).toBe("0.00%")
    expect(formatPercent("-0.005")).toBe("-0.01%")
    expect(formatFeeRate("0.001")).toBe("0.1%")
    expect(formatCompact("78000")).toBe("78K")
    expect(direction("-1")).toBe("down")
    expect(direction("0")).toBe("flat")
  })
})

describe("portfolio valuation", () => {
  test("USDC at 1, others at their USDC market; unpriced assets reported, not guessed", () => {
    const tickers = { BTCUSDC: tickerFromRest({ symbol: "BTCUSDC", lastPrice: "50000" }) }
    const assets = [asset(), asset({ assetId: "b", symbol: "BTC", availableBalance: "0.01", lockedBalance: "0.01" }), asset({ assetId: "x", symbol: "XYZ", availableBalance: "5" }), asset({ assetId: "z", symbol: "ZERO", availableBalance: "0" })]
    expect(portfolioValue(assets, tickers)).toEqual({ total: "1100", unvalued: ["XYZ"] })
  })
})

describe("post-login redirect", () => {
  test("only same-origin paths", () => {
    expect(safeNextPath("/trade/BTCUSDC")).toBe("/trade/BTCUSDC")
    expect(safeNextPath("//evil.example")).toBeNull()
    expect(safeNextPath("https://evil.example")).toBeNull()
    expect(safeNextPath("/\\evil")).toBeNull()
    expect(safeNextPath("/login")).toBeNull()
  })
})

describe("order book depth", () => {
  test("cumulative totals are exact", () => {
    expect(withCumulative([{ price: "1", quantity: "0.1" }, { price: "2", quantity: "0.2" }], 5).map((r) => r.cumulative)).toEqual(["0.1", "0.3"])
  })
})
