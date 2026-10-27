import logger from "../config/logger";
import type { MarketRegistry } from "../market/registry";
import type { CandleAggregator } from "../processors/candle";
import type { OrderBookSync } from "../processors/orderbook-sync";
import type { TickerAggregator } from "../processors/tickers";
import { publishCandles } from "../producers/candle";
import { toTickerEvent, type MarketPublisher } from "../producers/market";

/**
 * Time-driven market data that no trade triggers:
 * - ticker windows expire (24h volume decays during quiet periods), and
 *   changed tickers are re-published;
 * - candles that crossed their close time are published once with
 *   `isClosed: true`;
 * - market metadata (status, filters) is refreshed from Postgres;
 * - every book is re-published as a full depth snapshot periodically.
 *
 * Publication failures are logged by the publisher and retried on the next
 * tick for candles; tickers are superseded by the next change anyway.
 */
export class MarketTimers {
  private timers: Array<ReturnType<typeof setInterval>> = [];

  constructor(
    private readonly deps: {
      ticker: TickerAggregator;
      candles: CandleAggregator;
      publisher: MarketPublisher;
      registry: MarketRegistry;
      orderBookSync: Pick<OrderBookSync, "publishSnapshots">;
      depthSnapshotIntervalMs: number;
    },
  ) {}

  async publishExpiredTickers(now = Date.now()): Promise<void> {
    const changed = this.deps.ticker.refresh(now);
    if (changed.length > 0) {
      await this.deps.publisher.publish(changed.map((t) => toTickerEvent(t, now)));
    }
  }

  async publishClosedCandles(now = Date.now()): Promise<void> {
    const closed = this.deps.candles.collectNewlyClosed(now);
    if (closed.length === 0) return;
    try {
      await publishCandles(closed, this.deps.publisher);
    } catch (error) {
      this.deps.candles.unmarkClosePublished(closed);
      throw error;
    }
  }

  start(): void {
    const guard = (name: string, fn: () => Promise<void>) => () => {
      fn().catch((error) => logger.warn({ err: error, task: name }, "Market timer task failed"));
    };

    this.timers.push(
      setInterval(guard("ticker-expiry", () => this.publishExpiredTickers()), 5_000),
      setInterval(guard("candle-close", () => this.publishClosedCandles()), 1_000),
      setInterval(guard("registry-refresh", () => this.deps.registry.refresh()), 60_000),
      // Full depth snapshots let late-joining consumers sync without a REST call.
      setInterval(guard("depth-snapshot", () => this.deps.orderBookSync.publishSnapshots()), this.deps.depthSnapshotIntervalMs),
    );
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
