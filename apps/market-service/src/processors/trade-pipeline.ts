import logger from "../config/logger";
import { BoundedSet } from "../lib/bounded-set";
import { formatScaled, mulScaled, toScaled } from "../lib/decimal";
import { metrics } from "../lib/metrics";
import { toCandleEvent } from "../producers/candle";
import { toTickerEvent, toTradeEvent, type MarketPublisher } from "../producers/market";
import type { RecentTradesStore, PublicTrade } from "../store/trades";
import type { TradeExecutedEvent } from "../types/engine-events";
import type { MarketEvent } from "../types/events";
import { CANDLE_INTERVALS, INTERVALS, type CandleAggregator } from "./candle";
import type { TickerAggregator } from "./tickers";

/**
 * Maps the engine contract to the public trade. `Trade.side` in the per-user
 * table is each user's own side; the public side here is the TAKER (aggressor)
 * side, and `isBuyerMaker` follows from the maker side.
 */
export function toPublicTrade(event: TradeExecutedEvent): PublicTrade {
  const price = toScaled(event.price);
  const quantity = toScaled(event.quantity);
  return {
    tradeId: event.tradeId,
    symbol: event.symbol,
    price: event.price,
    quantity: event.quantity,
    quoteQuantity: formatScaled(mulScaled(price, quantity)),
    side: event.taker.side,
    isBuyerMaker: event.maker.side === "BUY",
    timestamp: event.timestamp,
  };
}

export interface TradePipelineDeps {
  repo: { insertIfAbsent(trade: PublicTrade): Promise<boolean> };
  publisher: Pick<MarketPublisher, "publish">;
  ticker: TickerAggregator;
  candles: CandleAggregator;
  recent: RecentTradesStore;
  isServed: (symbol: string) => boolean;
  replayPublishMaxAgeMs: number;
  now?: () => number;
}

export type TradeOutcome = "applied" | "duplicate" | "unknown_market";

/**
 * Trade processing with replay safety:
 *
 * 1. `MarketTrade` insert-if-absent is the durable dedupe point. Only a newly
 *    inserted trade mutates in-memory state, so Kafka redelivery (including
 *    after a restart, when state was rebuilt from MarketTrade) can never
 *    double-count ticker or candle volume.
 * 2. Derived events are published after the state change. If publishing
 *    fails the handler throws, Kafka redelivers, the insert reports a
 *    duplicate, and — because the trade is still in `pendingPublish` — the
 *    events are re-published without re-aggregating. Publication is therefore
 *    at-least-once within a process lifetime; consumers dedupe by tradeId.
 * 3. A crash after the insert but before publishing loses only the derived
 *    events for that trade (state is rebuilt from MarketTrade on restart).
 */
export class TradePipeline {
  private readonly pendingPublish = new BoundedSet<string>(10_000);
  private readonly now: () => number;

  constructor(private readonly deps: TradePipelineDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Applies a trade to in-memory state only. Used directly by startup reconstruction. */
  applyToState(trade: PublicTrade, now = this.now()): void {
    this.deps.recent.addTrade(trade);
    this.deps.ticker.processTrade(trade, now);
    this.deps.candles.processTrade(trade, now);
  }

  async handle(event: TradeExecutedEvent): Promise<TradeOutcome> {
    if (!this.deps.isServed(event.symbol)) {
      metrics.inc("market_trades_total", { outcome: "unknown_market" });
      return "unknown_market";
    }

    const trade = toPublicTrade(event);
    const inserted = await this.deps.repo.insertIfAbsent(trade);
    const now = this.now();

    if (inserted) {
      this.applyToState(trade, now);
      this.pendingPublish.add(trade.tradeId);
      metrics.inc("market_trades_total", { outcome: "applied", symbol: trade.symbol });
    } else if (!this.pendingPublish.has(trade.tradeId)) {
      metrics.inc("market_trades_total", { outcome: "duplicate", symbol: trade.symbol });
      return "duplicate";
    }

    if (now - trade.timestamp > this.deps.replayPublishMaxAgeMs) {
      // Historical replay (e.g. a new consumer group reading from the start):
      // state is updated but old trades are not re-broadcast to live clients.
      this.pendingPublish.delete(trade.tradeId);
      return inserted ? "applied" : "duplicate";
    }

    await this.deps.publisher.publish(this.buildEvents(trade, now));
    this.pendingPublish.delete(trade.tradeId);
    return inserted ? "applied" : "duplicate";
  }

  private buildEvents(trade: PublicTrade, now: number): MarketEvent[] {
    const events: MarketEvent[] = [toTradeEvent(trade, now)];

    events.push(toTickerEvent(this.deps.ticker.current(trade.symbol, now), now));

    for (const interval of INTERVALS) {
      const duration = CANDLE_INTERVALS[interval];
      const openTime = Math.floor(trade.timestamp / duration) * duration;
      const candle = this.deps.candles.getCandle(trade.symbol, interval, openTime, now);
      if (candle) events.push(toCandleEvent(candle, now));
    }

    if (events.length === 2) {
      logger.debug({ tradeId: trade.tradeId }, "Trade older than in-memory candles; no candle events");
    }

    return events;
  }
}
