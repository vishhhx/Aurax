import { apiGet } from "./client"
import type {
  Candle,
  CandleInterval,
  HistoricalTradesPage,
  MarketInfo,
  MarketStatusInfo,
  OrderBookSnapshot,
  PublicTrade,
  Ticker,
} from "./types"

/**
 * Public market data (api-gateway /api/v1/market). Every route answers 503
 * until market-service has loaded its state.
 *
 * REST and WebSocket payloads use different field names (openPrice vs
 * openPrice24h, timestamp vs executedAt). This module is the one adapter that
 * maps both onto the shared types.
 */

const BASE = "/api/v1/market"

type Raw = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null)
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? fallback) || fallback)

export function tickerFromRest(t: Raw): Ticker {
  return {
    symbol: String(t.symbol),
    lastPrice: str(t.lastPrice),
    openPrice: str(t.openPrice),
    highPrice: str(t.highPrice),
    lowPrice: str(t.lowPrice),
    priceChange: str(t.priceChange),
    priceChangePercent: str(t.priceChangePercent),
    volume: str(t.volume) ?? "0",
    quoteVolume: str(t.quoteVolume) ?? "0",
    tradeCount: num(t.tradeCount),
    lastTradeTimestamp: t.lastTradeTimestamp == null ? null : num(t.lastTradeTimestamp),
    updatedAt: num(t.updatedAt, 0),
  }
}

export function tickerFromStream(symbol: string, d: Raw, timestamp: number): Ticker {
  return {
    symbol,
    lastPrice: str(d.lastPrice),
    openPrice: str(d.openPrice24h),
    highPrice: str(d.high24h),
    lowPrice: str(d.low24h),
    priceChange: str(d.priceChange24h),
    priceChangePercent: str(d.priceChangePercent24h),
    volume: str(d.baseVolume24h) ?? "0",
    quoteVolume: str(d.quoteVolume24h) ?? "0",
    tradeCount: num(d.tradeCount24h),
    lastTradeTimestamp: d.lastTradeTimestamp == null ? null : num(d.lastTradeTimestamp),
    updatedAt: timestamp,
  }
}

export function tradeFromRest(t: Raw): PublicTrade {
  return {
    tradeId: String(t.tradeId),
    price: String(t.price),
    quantity: String(t.quantity),
    quoteQuantity: str(t.quoteQuantity) ?? "0",
    side: t.side === "SELL" ? "SELL" : "BUY",
    executedAt: num(t.timestamp),
  }
}

export function tradeFromStream(t: Raw): PublicTrade {
  return {
    tradeId: String(t.tradeId),
    price: String(t.price),
    quantity: String(t.quantity),
    quoteQuantity: str(t.quoteQuantity) ?? "0",
    side: t.side === "SELL" ? "SELL" : "BUY",
    executedAt: num(t.executedAt),
  }
}

export function candleFrom(c: Raw): Candle {
  return {
    openTime: num(c.openTime),
    closeTime: num(c.closeTime),
    open: String(c.open),
    high: String(c.high),
    low: String(c.low),
    close: String(c.close),
    baseVolume: str(c.baseVolume) ?? "0",
    quoteVolume: str(c.quoteVolume) ?? "0",
    tradeCount: num(c.tradeCount),
    isClosed: Boolean(c.isClosed),
  }
}

/** "btc-usdc", "BTC/USDC" → "BTCUSDC" (the canonical form the API returns). */
export function canonicalSymbol(input: string): string {
  return decodeURIComponent(input).replace(/[-_/]/g, "").toUpperCase()
}

const enc = encodeURIComponent

export const marketApi = {
  markets: () => apiGet<MarketInfo[]>(`${BASE}/markets`),
  market: (symbol: string) => apiGet<MarketInfo>(`${BASE}/markets/${enc(symbol)}`),
  status: (symbol: string) => apiGet<MarketStatusInfo>(`${BASE}/markets/${enc(symbol)}/status`),
  tickers: async () => (await apiGet<Raw[]>(`${BASE}/tickers`)).map(tickerFromRest),
  ticker: async (symbol: string) => tickerFromRest(await apiGet<Raw>(`${BASE}/markets/${enc(symbol)}/ticker`)),
  orderBook: (symbol: string, limit = 50) => apiGet<OrderBookSnapshot>(`${BASE}/markets/${enc(symbol)}/orderbook`, { limit }),
  candles: async (symbol: string, interval: CandleInterval, opts: { limit?: number; startTime?: number; endTime?: number } = {}) =>
    (await apiGet<Raw[]>(`${BASE}/markets/${enc(symbol)}/candles`, { interval, limit: opts.limit ?? 300, startTime: opts.startTime, endTime: opts.endTime })).map(candleFrom),
  trades: async (symbol: string, limit = 50) => (await apiGet<Raw[]>(`${BASE}/markets/${enc(symbol)}/trades`, { limit })).map(tradeFromRest),
  historicalTrades: async (symbol: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<HistoricalTradesPage> => {
    const page = await apiGet<{ trades: Raw[]; nextCursor: string | null; limit: number }>(`${BASE}/markets/${enc(symbol)}/historical-trades`, {
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? undefined,
    })
    return { trades: page.trades.map(tradeFromRest), nextCursor: page.nextCursor, limit: page.limit }
  },
  ready: () => apiGet<unknown>(`${BASE}/health/ready`),
}
