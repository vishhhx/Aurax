/**
 * Outbound market-data contracts (schema v2), published by market-service on
 * the existing `market.events` topic with key = symbol, so every event for a
 * symbol is on one partition in publish order. Consumed by the socket gateway.
 *
 * All prices, quantities and volumes are decimal strings; timestamps are Unix
 * ms; sequence numbers are unsigned-integer strings. `eventId` is
 * deterministic, so consumers can drop Kafka redeliveries by ID.
 *
 * Sequence numbers per type:
 * - depth.updated   — engine book sequence for the symbol. A delta applies
 *                     only on top of `data.prevSequenceNumber`; anything else
 *                     is a gap and requires a snapshot.
 * - trades.updated  — null (identity is `data.tradeId`).
 * - ticker.updated  — per-symbol ticker revision; restarts with the service.
 * - candles.updated — revision of that candle (= its trade count); a higher
 *                     value for the same (interval, openTime) supersedes.
 */

export const MARKET_EVENT_SCHEMA_VERSION = 2 as const;

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "1d";

export type MarketEventType = "depth.updated" | "trades.updated" | "ticker.updated" | "candles.updated";

interface Envelope<T extends MarketEventType, D> {
  eventId: string;
  type: T;
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  symbol: string;
  sequenceNumber: string | null;
  /** When market-service produced the event */
  timestamp: number;
  data: D;
}

export interface DepthLevel {
  price: string;
  /** "0" in a delta means the level was removed from the top-N view */
  quantity: string;
}

export type DepthData =
  | {
      kind: "snapshot";
      /** Levels per side in this view (top-N) */
      depth: number;
      bids: DepthLevel[];
      asks: DepthLevel[];
    }
  | {
      kind: "delta";
      depth: number;
      /** The sequence number this delta must be applied on top of */
      prevSequenceNumber: string;
      /** Changed levels only (upserts; quantity "0" = remove) */
      bids: DepthLevel[];
      asks: DepthLevel[];
    };

export interface TradeData {
  tradeId: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  /** Taker (aggressor) side */
  side: "BUY" | "SELL";
  isBuyerMaker: boolean;
  /** Engine execution time */
  executedAt: number;
}

export interface TickerData {
  lastPrice: string | null;
  openPrice24h: string | null;
  priceChange24h: string | null;
  priceChangePercent24h: string | null;
  high24h: string | null;
  low24h: string | null;
  baseVolume24h: string;
  quoteVolume24h: string;
  tradeCount24h: number;
  lastTradeTimestamp: number | null;
  /** Exclusive start of the rolling 24h window */
  windowStart: number;
}

export interface CandleData {
  interval: CandleInterval;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
  tradeCount: number;
  isClosed: boolean;
}

export type DepthUpdatedEvent = Envelope<"depth.updated", DepthData>;
export type TradesUpdatedEvent = Envelope<"trades.updated", TradeData>;
export type TickerUpdatedEvent = Envelope<"ticker.updated", TickerData>;
export type CandlesUpdatedEvent = Envelope<"candles.updated", CandleData>;

export type MarketEvent = DepthUpdatedEvent | TradesUpdatedEvent | TickerUpdatedEvent | CandlesUpdatedEvent;
