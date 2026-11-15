import { z } from "zod"

/**
 * Runtime validation for socket.io payloads (docs/frontend-integration/websocket-api.md,
 * apps/websockets/src/market/protocol.ts, apps/websockets/src/private/user-events.ts).
 * Malformed messages are dropped rather than rendered.
 */

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/)
const nullableDecimal = decimal.nullable()

export const channelSchema = z.enum(["depth", "trades", "ticker", "candles"])
export const intervalSchema = z.enum(["1m", "5m", "15m", "1h", "1d"])

export type Channel = z.infer<typeof channelSchema>

export const levelSchema = z.object({ price: decimal, quantity: decimal })

export const depthSnapshotData = z.object({
  sequenceNumber: z.union([z.string(), z.number()]).optional(),
  depth: z.number().optional(),
  bids: z.array(levelSchema),
  asks: z.array(levelSchema),
})

export const depthUpdateData = z.object({
  bids: z.array(levelSchema),
  asks: z.array(levelSchema),
})

export const tradeData = z.object({
  tradeId: z.string(),
  price: decimal,
  quantity: decimal,
  quoteQuantity: decimal.optional(),
  side: z.enum(["BUY", "SELL"]),
  isBuyerMaker: z.boolean().optional(),
  executedAt: z.number(),
})

export const tickerData = z.object({
  lastPrice: nullableDecimal,
  openPrice24h: nullableDecimal,
  priceChange24h: nullableDecimal,
  priceChangePercent24h: nullableDecimal,
  high24h: nullableDecimal,
  low24h: nullableDecimal,
  baseVolume24h: decimal,
  quoteVolume24h: decimal,
  tradeCount24h: z.number(),
  lastTradeTimestamp: z.number().nullable(),
  windowStart: z.number().optional(),
})

export const candleData = z.object({
  interval: intervalSchema.optional(),
  openTime: z.number(),
  closeTime: z.number(),
  open: decimal,
  high: decimal,
  low: decimal,
  close: decimal,
  baseVolume: decimal,
  quoteVolume: decimal,
  tradeCount: z.number(),
  isClosed: z.boolean(),
})

const base = {
  key: z.string(),
  channel: channelSchema,
  symbol: z.string(),
  interval: intervalSchema.optional(),
}

export const marketMessageSchema = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("snapshot"), ...base, sequenceNumber: z.string().nullable(), data: z.unknown() }),
  z.looseObject({
    type: z.literal("update"),
    ...base,
    eventId: z.string(),
    sequenceNumber: z.string().nullable(),
    prevSequenceNumber: z.string().optional(),
    timestamp: z.number(),
    data: z.unknown(),
  }),
  z.looseObject({ type: z.literal("resync"), ...base, channel: z.literal("depth"), reason: z.string() }),
  z.looseObject({ type: z.literal("error"), error: z.string() }),
])

export type MarketMessage = z.infer<typeof marketMessageSchema>
export type MarketDataMessage = Exclude<MarketMessage, { type: "error" }>

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  userId: z.string().optional(),
  reason: z.enum(["invalid_token", "expired_token"]).optional(),
})

export type SocketSession = z.infer<typeof sessionSchema>

// ─── Private "user" events ────────────────────────────────────────────

const side = z.enum(["BUY", "SELL"])
const orderStatus = z.enum(["PENDING", "OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"])

const userEvent = <T extends string, S extends z.ZodType>(type: T, data: S) =>
  z.object({ type: z.literal(type), eventId: z.string().min(1), timestamp: z.number(), data })

export const userMessageSchema = z.discriminatedUnion("type", [
  userEvent(
    "order.accepted",
    z.looseObject({
      orderId: z.string(),
      symbol: z.string(),
      side,
      orderType: z.enum(["LIMIT", "MARKET"]),
      quantity: decimal,
      price: nullableDecimal,
    }),
  ),
  userEvent(
    "order.opened",
    z.looseObject({ orderId: z.string(), symbol: z.string(), side, price: nullableDecimal.optional(), executedQuantity: decimal, remainingQuantity: decimal }),
  ),
  userEvent(
    "trade.executed",
    z.looseObject({
      tradeId: z.string(),
      symbol: z.string(),
      orderId: z.string(),
      side,
      liquidity: z.enum(["MAKER", "TAKER"]),
      price: decimal,
      quantity: decimal,
      orderStatus: orderStatus.optional(),
      executedAt: z.number(),
    }),
  ),
  ...(["order.partially_filled", "order.filled"] as const).map((t) =>
    userEvent(
      t,
      z.looseObject({
        orderId: z.string(),
        symbol: z.string(),
        side,
        lastFillPrice: decimal,
        lastFillQuantity: decimal,
        executedQuantity: nullableDecimal,
        remainingQuantity: nullableDecimal,
        status: orderStatus,
      }),
    ),
  ),
  userEvent(
    "order.cancelled",
    z.looseObject({ orderId: z.string(), symbol: z.string(), reason: z.string(), executedQuantity: decimal.optional(), remainingQuantity: decimal.optional() }),
  ),
  userEvent("order.rejected", z.looseObject({ orderId: z.string(), symbol: z.string(), reason: z.string() })),
  userEvent("order.cancel_rejected", z.looseObject({ orderId: z.string(), symbol: z.string(), reason: z.string() })),
  userEvent(
    "balance.updated",
    z.looseObject({
      assetId: z.string(),
      asset: z.string(),
      available: decimal,
      locked: decimal,
      total: decimal,
      reason: z.string(),
      referenceId: z.string().nullable().optional(),
      version: z.number(),
    }),
  ),
  userEvent("deposit.completed", z.looseObject({ depositId: z.string(), assetId: z.string(), amount: decimal, balance: z.unknown().optional() })),
])

export type UserMessage = z.infer<typeof userMessageSchema>
export type UserMessageType = UserMessage["type"]
export type UserMessageOf<T extends UserMessageType> = Extract<UserMessage, { type: T }>
