/**
 * REST contract types, mirrored from docs/frontend-integration/http-api.md and
 * openapi.yaml (verified against the service controllers). Every amount is a
 * decimal string. Timestamps are ISO strings in auth/wallet/order responses and
 * Unix milliseconds in market responses.
 */

export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message: string
  statusCode?: number
  errors?: unknown[]
}

// ─── Auth ─────────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "github"

export interface UserProfile {
  userId: string
  email: string
  name: string
  provider: OAuthProvider | "local"
  isEmailVerified: boolean
  lastLogin?: string
  createdAt?: string
}

// ─── Market (public) ──────────────────────────────────────────────────

export type MarketStatus = "TRADING" | "HALTED" | "MAINTENANCE" | "CANCEL_ONLY" | "POST_ONLY"

export interface MarketInfo {
  marketId: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: MarketStatus
  tickSize: string
  stepSize: string
  minPrice: string
  maxPrice: string
  minQuantity: string
  maxQuantity: string
  minNotional: string
  makerFee: string
  takerFee: string
  pricePrecision: number
  quantityPrecision: number
}

export interface MarketStatusInfo {
  symbol: string
  status: MarketStatus
  orderBookSequenceNumber: string | null
  orderBookUpdatedAt: number | null
  lastTradeTimestamp: number | null
}

/** Normalised 24h ticker; REST and WebSocket field names differ (see lib/api/market.ts). */
export interface Ticker {
  symbol: string
  lastPrice: string | null
  openPrice: string | null
  highPrice: string | null
  lowPrice: string | null
  priceChange: string | null
  /** Percent, e.g. "1.5625" means 1.5625% */
  priceChangePercent: string | null
  volume: string
  quoteVolume: string
  tradeCount: number
  lastTradeTimestamp: number | null
  /** Freshness used to keep the newest revision */
  updatedAt: number
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "1d"
export const CANDLE_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "1d"]

export interface Candle {
  openTime: number
  closeTime: number
  open: string
  high: string
  low: string
  close: string
  baseVolume: string
  quoteVolume: string
  tradeCount: number
  isClosed: boolean
}

export type Side = "BUY" | "SELL"

/** Public trade; side is the taker side. */
export interface PublicTrade {
  tradeId: string
  price: string
  quantity: string
  quoteQuantity: string
  side: Side
  executedAt: number
}

export interface BookLevel {
  price: string
  quantity: string
}

export interface OrderBookSnapshot {
  symbol: string
  sequenceNumber: string
  bids: BookLevel[]
  asks: BookLevel[]
  depth: number
  updatedAt: number
}

export interface HistoricalTradesPage {
  trades: PublicTrade[]
  nextCursor: string | null
  limit: number
}

// ─── Orders (private) ─────────────────────────────────────────────────

export type OrderType = "LIMIT" | "MARKET"
export type TimeInForce = "GTC" | "IOC" | "FOK"
export type OrderStatus = "PENDING" | "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED"

export const OPEN_STATUSES: readonly OrderStatus[] = ["PENDING", "OPEN", "PARTIALLY_FILLED"]

export interface Order {
  orderId: string
  symbol: string
  side: Side
  orderType: OrderType
  price: string | null
  quantity: string
  executedQuantity: string
  remainingQuantity: string
  averagePrice: string | null
  timeInForce: TimeInForce
  postOnly: boolean
  status: OrderStatus
  createdAt: string
  updatedAt: string
}

export interface Fill {
  tradeId: string
  executionId: string
  orderId: string
  symbol: string
  side: Side
  liquidity: "MAKER" | "TAKER"
  price: string
  quantity: string
  quoteAmount: string
  fee: string
  /** Asset id (cuid) of the fee asset; always the quote asset */
  feeAsset: string
  createdAt: string
}

export interface OrderDetail extends Order {
  fills: Fill[]
}

export interface PlaceOrderRequest {
  symbol: string
  side: Side
  orderType: OrderType
  quantity: string
  price?: string
  timeInForce?: TimeInForce
  postOnly?: boolean
}

export interface PlaceOrderResponse {
  order: Order
  reserved: { assetId: string; amount: string }
}

// ─── Wallet (private) ─────────────────────────────────────────────────

export interface WalletAsset {
  assetId: string
  symbol: string
  name: string
  imageUrl: string | null
  decimals: number
  network: string | null
  depositEnabled: boolean
  withdrawalEnabled: boolean
  minDeposit: string
  minWithdrawal: string
  createdAt: string
  updatedAt: string
  availableBalance: string
  lockedBalance: string
}

export type DepositStatus = "PENDING" | "CONFIRMING" | "COMPLETED" | "FAILED"

export interface Deposit {
  depositId: string
  assetId: string
  asset: string
  amount: string
  status: DepositStatus
  method: string
  providerOrderId: string | null
  providerPaymentId: string | null
  createdAt: string
  completedAt: string | null
}

export type LedgerReferenceType = "DEPOSIT" | "WITHDRAWAL" | "TRADE" | "FEE" | "ADJUSTMENT"

export interface LedgerEntry {
  ledgerId: string
  assetId: string
  asset: string
  entryType: "CREDIT" | "DEBIT"
  amount: string
  referenceType: LedgerReferenceType
  referenceId: string
  createdAt: string
}

export interface DepositQuote {
  amount: string
  currency: "INR"
  asset: "USDC"
  creditAmount: string
  /** Configured indicative INR per USDC, not a live market rate */
  rate: string
  minAmount: string
  maxAmount: string
}

/** Razorpay order object returned unchanged by init-deposit; receipt = depositId. */
export interface RazorpayOrder {
  id: string
  entity: "order"
  amount: number
  currency: string
  receipt: string
  status: string
}

export interface VerifyPaymentResponse {
  depositId: string
  orderId: string
  paymentId: string
  verified: boolean
  status: DepositStatus
}
