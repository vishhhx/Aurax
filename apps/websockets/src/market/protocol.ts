import { z } from "zod";

/**
 * Wire contracts.
 *
 * Inbound (Kafka `market.events`, produced by market-service, schema v2) — see
 * apps/market-service/src/types/events.ts and MARKET_DATA_PROTOCOL.md.
 *
 * Client protocol (socket.io event "market"):
 *   → { action: "subscribe" | "unsubscribe", channel, symbol, interval? }
 *   → { action: "subscribe" | "unsubscribe", subscriptions: [{ channel, symbol, interval? }] }
 *   → { action: "resync", channel: "depth", symbol }
 *   ← { type: "snapshot" | "update" | "resync" | "error", ... }   (see MarketMessage)
 */

export const SCHEMA_VERSION = 2;
export const CHANNELS = ["depth", "trades", "ticker", "candles"] as const;
export const INTERVALS = ["1m", "5m", "15m", "1h", "1d"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Interval = (typeof INTERVALS)[number];

const SYMBOL = /^[A-Z0-9]{2,20}$/;
const SEQ = /^\d+$/;

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "decimal string");
const level = z.object({ price: decimal, quantity: decimal });
const symbol = z.string().regex(SYMBOL);

const envelope = {
  eventId: z.string().min(1).max(256),
  schemaVersion: z.literal(SCHEMA_VERSION),
  symbol,
  timestamp: z.number().int().nonnegative(),
};

export const depthEventSchema = z.object({
  ...envelope,
  type: z.literal("depth.updated"),
  sequenceNumber: z.string().regex(SEQ),
  data: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("snapshot"), depth: z.number().int().positive(), bids: z.array(level), asks: z.array(level) }),
    z.object({
      kind: z.literal("delta"),
      depth: z.number().int().positive(),
      prevSequenceNumber: z.string().regex(SEQ),
      bids: z.array(level),
      asks: z.array(level),
    }),
  ]),
});

export const tradeEventSchema = z.object({
  ...envelope,
  type: z.literal("trades.updated"),
  sequenceNumber: z.null(),
  data: z.object({
    tradeId: z.string().min(1).max(128),
    price: decimal,
    quantity: decimal,
    quoteQuantity: decimal,
    side: z.enum(["BUY", "SELL"]),
    isBuyerMaker: z.boolean(),
    executedAt: z.number().int().nonnegative(),
  }),
});

export const tickerEventSchema = z.object({
  ...envelope,
  type: z.literal("ticker.updated"),
  sequenceNumber: z.string().regex(SEQ),
  data: z.object({
    lastPrice: decimal.nullable(),
    openPrice24h: decimal.nullable(),
    priceChange24h: z.string().nullable(),
    priceChangePercent24h: z.string().nullable(),
    high24h: decimal.nullable(),
    low24h: decimal.nullable(),
    baseVolume24h: decimal,
    quoteVolume24h: decimal,
    tradeCount24h: z.number().int().nonnegative(),
    lastTradeTimestamp: z.number().int().nullable(),
    windowStart: z.number(),
  }),
});

export const candleEventSchema = z.object({
  ...envelope,
  type: z.literal("candles.updated"),
  sequenceNumber: z.string().regex(SEQ),
  data: z.object({
    interval: z.enum(INTERVALS),
    openTime: z.number().int().nonnegative(),
    closeTime: z.number().int().nonnegative(),
    open: decimal,
    high: decimal,
    low: decimal,
    close: decimal,
    baseVolume: decimal,
    quoteVolume: decimal,
    tradeCount: z.number().int().positive(),
    isClosed: z.boolean(),
  }),
});

export const marketEventSchema = z.discriminatedUnion("type", [
  depthEventSchema,
  tradeEventSchema,
  tickerEventSchema,
  candleEventSchema,
]);

export type DepthEvent = z.infer<typeof depthEventSchema>;
export type TradeEvent = z.infer<typeof tradeEventSchema>;
export type TickerEvent = z.infer<typeof tickerEventSchema>;
export type CandleEvent = z.infer<typeof candleEventSchema>;
export type MarketEvent = z.infer<typeof marketEventSchema>;
export type DepthLevel = z.infer<typeof level>;

/** `BTC-USDT`, `btc/usdt` and `BTCUSDT` all name the same market. */
export function normalizeSymbol(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.replace(/[-_/]/g, "").toUpperCase();
  return SYMBOL.test(s) ? s : null;
}

export interface Subscription {
  channel: Channel;
  symbol: string;
  interval?: Interval;
}

export function subscriptionKey(s: Subscription): string {
  return s.channel === "candles" ? `md:candles:${s.symbol}:${s.interval}` : `md:${s.channel}:${s.symbol}`;
}

export type ClientRequest =
  | { action: "subscribe" | "unsubscribe"; subscriptions: Subscription[] }
  | { action: "resync"; subscriptions: Subscription[] };

const MAX_ITEMS_PER_REQUEST = 25;

function parseItem(raw: unknown): Subscription | string {
  const item = (raw ?? {}) as Record<string, unknown>;
  const channel = item.channel;
  if (!CHANNELS.includes(channel as Channel)) return `unsupported channel: ${String(channel)}`;
  const sym = normalizeSymbol(item.symbol);
  if (!sym) return `invalid symbol: ${String(item.symbol)}`;
  if (channel === "candles") {
    if (!INTERVALS.includes(item.interval as Interval)) return `candles require interval in ${INTERVALS.join(", ")}`;
    return { channel, symbol: sym, interval: item.interval as Interval };
  }
  if (item.interval !== undefined) return `interval is only valid for candles`;
  return { channel: channel as Channel, symbol: sym };
}

export function parseClientRequest(payload: unknown): { ok: true; request: ClientRequest } | { ok: false; error: string } {
  if (typeof payload !== "object" || payload === null) return { ok: false, error: "request must be an object" };
  const p = payload as Record<string, unknown>;
  const action = p.action;
  if (action !== "subscribe" && action !== "unsubscribe" && action !== "resync") {
    return { ok: false, error: `unsupported action: ${String(action)}` };
  }

  const items = Array.isArray(p.subscriptions) ? p.subscriptions : [p];
  if (items.length === 0) return { ok: false, error: "subscriptions must not be empty" };
  if (items.length > MAX_ITEMS_PER_REQUEST) return { ok: false, error: `at most ${MAX_ITEMS_PER_REQUEST} items per request` };

  const subscriptions: Subscription[] = [];
  for (const raw of items) {
    const parsed = parseItem(raw);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    if (action === "resync" && parsed.channel !== "depth") return { ok: false, error: "resync is only supported for depth" };
    subscriptions.push(parsed);
  }
  return { ok: true, request: { action, subscriptions } };
}

/** Server → client envelope on socket event "market". */
export type MarketMessage =
  | {
      type: "snapshot";
      key: string;
      channel: Channel;
      symbol: string;
      interval?: Interval;
      sequenceNumber: string | null;
      data: unknown;
    }
  | {
      type: "update";
      key: string;
      channel: Channel;
      symbol: string;
      interval?: Interval;
      eventId: string;
      sequenceNumber: string | null;
      prevSequenceNumber?: string;
      timestamp: number;
      data: unknown;
    }
  | { type: "resync"; key: string; channel: "depth"; symbol: string; reason: string };
