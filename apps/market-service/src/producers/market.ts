import { randomUUID } from "node:crypto";
import { TOPICS, producer } from "@repo/kafka";
import { CompressionTypes, type ProducerRecord } from "kafkajs";

import logger from "../config/logger";
import { metrics } from "../lib/metrics";
import type { OrderBookSnapshot, PriceLevel } from "../store/orderbook";
import type { TickerState } from "../store/ticker";
import type { PublicTrade } from "../store/trades";
import {
  MARKET_EVENT_SCHEMA_VERSION,
  type DepthLevel,
  type DepthUpdatedEvent,
  type MarketEvent,
  type TickerUpdatedEvent,
  type TradesUpdatedEvent,
} from "../types/events";

export type SendFn = (record: ProducerRecord) => Promise<unknown>;

/** Distinguishes ticker revisions across restarts (ticker sequences restart at 1). */
const BOOT_ID = randomUUID().slice(0, 8);

/**
 * Publishes derived market data to `market.events`.
 *
 * - key = symbol: every event for a symbol lands on the same partition, so
 *   per-symbol ordering is preserved for consumers.
 * - acks = -1 and GZIP, matching the matching-engine producer.
 * - Events from one input are sent as a single batch request.
 */
export class MarketPublisher {
  constructor(private readonly send: SendFn = (record) => producer.send(record)) {}

  async publish(events: MarketEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      await this.send({
        topic: TOPICS.MARKET_EVENTS,
        compression: CompressionTypes.GZIP,
        acks: -1,
        messages: events.map((event) => ({
          key: event.symbol,
          value: JSON.stringify(event),
          headers: {
            "event-type": event.type,
            "event-id": event.eventId,
            "schema-version": String(MARKET_EVENT_SCHEMA_VERSION),
          },
        })),
      });
      for (const event of events) metrics.inc("market_events_published_total", { type: event.type });
    } catch (error) {
      metrics.inc("market_publish_failures_total", { type: events[0]!.type });
      logger.error(
        { err: error, count: events.length, first: events[0]!.type, symbol: events[0]!.symbol },
        "Failed to publish market events",
      );
      throw error;
    }
  }
}

export const marketPublisher = new MarketPublisher();

export function toTradeEvent(trade: PublicTrade, now = Date.now()): TradesUpdatedEvent {
  return {
    eventId: `trades:${trade.symbol}:${trade.tradeId}`,
    type: "trades.updated",
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    symbol: trade.symbol,
    sequenceNumber: null,
    timestamp: now,
    data: {
      tradeId: trade.tradeId,
      price: trade.price,
      quantity: trade.quantity,
      quoteQuantity: trade.quoteQuantity,
      side: trade.side,
      isBuyerMaker: trade.isBuyerMaker,
      executedAt: trade.timestamp,
    },
  };
}

export function toTickerEvent(ticker: TickerState, now = Date.now()): TickerUpdatedEvent {
  const seq = ticker.sequenceNumber.toString();
  return {
    eventId: `ticker:${ticker.symbol}:${BOOT_ID}:${seq}`,
    type: "ticker.updated",
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    symbol: ticker.symbol,
    sequenceNumber: seq,
    timestamp: now,
    data: {
      lastPrice: ticker.lastPrice,
      openPrice24h: ticker.open24h,
      priceChange24h: ticker.priceChange24h,
      priceChangePercent24h: ticker.priceChangePercent24h,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      baseVolume24h: ticker.baseVolume24h,
      quoteVolume24h: ticker.quoteVolume24h,
      tradeCount24h: ticker.tradeCount24h,
      lastTradeTimestamp: ticker.lastTradeTimestamp,
      windowStart: ticker.windowStart,
    },
  };
}

export interface DepthView {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export function topN(snapshot: Pick<OrderBookSnapshot, "bids" | "asks">, depth: number): DepthView {
  return { bids: snapshot.bids.slice(0, depth), asks: snapshot.asks.slice(0, depth) };
}

function diffSide(prev: PriceLevel[], next: PriceLevel[]): DepthLevel[] {
  const before = new Map(prev.map((l) => [l.price, l.quantity]));
  const changes: DepthLevel[] = [];
  for (const l of next) {
    if (before.get(l.price) !== l.quantity) changes.push({ price: l.price, quantity: l.quantity });
    before.delete(l.price);
  }
  for (const price of before.keys()) changes.push({ price, quantity: "0" });
  return changes;
}

/**
 * Changes that turn the previous top-N view into the next one. Applying them
 * (upsert; "0" removes) to the previous view and keeping the best `depth`
 * levels reproduces the next view exactly.
 */
export function diffDepth(prev: DepthView, next: DepthView): DepthView {
  return { bids: diffSide(prev.bids, next.bids), asks: diffSide(prev.asks, next.asks) };
}

export function toDepthSnapshotEvent(
  symbol: string,
  sequenceNumber: bigint,
  view: DepthView,
  depth: number,
  now = Date.now(),
): DepthUpdatedEvent {
  const seq = sequenceNumber.toString();
  return {
    eventId: `depth:${symbol}:snapshot:${seq}`,
    type: "depth.updated",
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    symbol,
    sequenceNumber: seq,
    timestamp: now,
    data: { kind: "snapshot", depth, bids: view.bids, asks: view.asks },
  };
}

export function toDepthDeltaEvent(
  symbol: string,
  sequenceNumber: bigint,
  prevSequenceNumber: bigint,
  changes: DepthView,
  depth: number,
  now = Date.now(),
): DepthUpdatedEvent {
  const seq = sequenceNumber.toString();
  const prev = prevSequenceNumber.toString();
  return {
    eventId: `depth:${symbol}:delta:${prev}:${seq}`,
    type: "depth.updated",
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    symbol,
    sequenceNumber: seq,
    timestamp: now,
    data: { kind: "delta", depth, prevSequenceNumber: prev, bids: changes.bids, asks: changes.asks },
  };
}
