import type { Candle } from "../processors/candle";
import { MARKET_EVENT_SCHEMA_VERSION, type CandlesUpdatedEvent } from "../types/events";
import { marketPublisher, type MarketPublisher } from "./market";

/**
 * `sequenceNumber` is the candle's revision (its trade count): monotonic per
 * (symbol, interval, openTime), so a consumer keeps the highest one.
 */
export function toCandleEvent(candle: Candle, now = Date.now()): CandlesUpdatedEvent {
  const revision = String(candle.tradeCount);
  return {
    eventId: `candles:${candle.symbol}:${candle.interval}:${candle.openTime}:${revision}:${candle.isClosed ? "c" : "o"}`,
    type: "candles.updated",
    schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
    symbol: candle.symbol,
    sequenceNumber: revision,
    timestamp: now,
    data: {
      interval: candle.interval,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      baseVolume: candle.baseVolume,
      quoteVolume: candle.quoteVolume,
      tradeCount: candle.tradeCount,
      isClosed: candle.isClosed,
    },
  };
}

/** Publishes candle revisions (e.g. the candles a trade touched, or newly closed candles). */
export async function publishCandles(
  candles: Candle[],
  publisher: MarketPublisher = marketPublisher,
): Promise<void> {
  const now = Date.now();
  await publisher.publish(candles.map((c) => toCandleEvent(c, now)));
}
