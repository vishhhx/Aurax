import { CandleAggregator } from "../src/processors/candle";
import { TickerAggregator } from "../src/processors/tickers";
import { TradePipeline } from "../src/processors/trade-pipeline";
import { TickerStore } from "../src/store/ticker";
import { RecentTradesStore, type PublicTrade } from "../src/store/trades";
import type { MarketEvent } from "../src/types/events";
import { T0 } from "./helpers";

export class FakeTradeRepo {
  readonly rows = new Map<string, PublicTrade>();
  failNext = 0;
  async insertIfAbsent(t: PublicTrade) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("db down");
    }
    if (this.rows.has(t.tradeId)) return false;
    this.rows.set(t.tradeId, t);
    return true;
  }
}

export function makePipeline(opts: { repo?: FakeTradeRepo; now?: number; failPublish?: number } = {}) {
  const repo = opts.repo ?? new FakeTradeRepo();
  const published: MarketEvent[] = [];
  let failPublish = opts.failPublish ?? 0;
  const tickerStore = new TickerStore();
  const ticker = new TickerAggregator(tickerStore);
  const candles = new CandleAggregator();
  const recent = new RecentTradesStore(10);
  const pipeline = new TradePipeline({
    repo,
    publisher: {
      publish: async (events) => {
        if (failPublish > 0) {
          failPublish--;
          throw new Error("kafka down");
        }
        published.push(...events);
      },
    },
    ticker,
    candles,
    recent,
    isServed: (s) => s === "BTCUSDC",
    replayPublishMaxAgeMs: 60_000,
    now: () => opts.now ?? T0 + 1_000,
  });
  return { repo, published, tickerStore, ticker, candles, recent, pipeline };
}

