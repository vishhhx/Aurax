import logger from "../config/logger";
import { CANDLE_INTERVALS } from "../processors/candle";
import { TICKER_WINDOW_MS } from "../processors/tickers";
import type { TradePipeline } from "../processors/trade-pipeline";
import type { TickerAggregator } from "../processors/tickers";
import type { PublicTrade } from "../store/trades";

const DAY_MS = CANDLE_INTERVALS["1d"];

/**
 * Start of the reconstruction range: the UTC day boundary at or before
 * `now - 24h`. Every candle interval divides one day, so every candle whose
 * openTime is ≥ this boundary is rebuilt from ALL of its trades — a rebuilt
 * (and re-persisted) candle is complete, never partial. The same range covers
 * the rolling 24h ticker window and the recent-trades list.
 */
export function reconstructionStart(now: number): number {
  return Math.floor((now - TICKER_WINDOW_MS) / DAY_MS) * DAY_MS;
}

/**
 * Rebuilds ticker, candle and recent-trade state from MarketTrade (the
 * durable public trade record) before consumers start. The rebuilt trade IDs
 * also seed the in-memory dedupe sets, and MarketTrade itself rejects
 * redelivered trades, so Kafka replay after a restart cannot double-count.
 *
 * Trades that existed before MarketTrade was introduced are not available;
 * tickers and candles then start from the first recorded trade.
 */
export async function reconstructMarketState(params: {
  symbols: string[];
  pipeline: Pick<TradePipeline, "applyToState">;
  ticker: TickerAggregator;
  stream: (symbols: string[], since: number) => AsyncIterable<PublicTrade[]>;
  now?: number;
}): Promise<{ trades: number; since: number }> {
  const now = params.now ?? Date.now();
  const since = reconstructionStart(now);
  let count = 0;

  params.ticker.register(params.symbols, now);

  for await (const batch of params.stream(params.symbols, since)) {
    for (const trade of batch) {
      params.pipeline.applyToState(trade, now);
    }
    count += batch.length;
  }

  logger.info(
    { trades: count, since: new Date(since).toISOString(), symbols: params.symbols },
    "Reconstructed ticker, candle and recent-trade state from MarketTrade",
  );

  return { trades: count, since };
}
