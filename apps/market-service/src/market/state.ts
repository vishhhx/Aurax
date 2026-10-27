/**
 * The authoritative in-memory market state. Every consumer, worker and
 * controller imports these instances; there are no other copies.
 */
import { ENV } from "../config/env";
import { CandleAggregator } from "../processors/candle";
import { TickerAggregator } from "../processors/tickers";
import { orderBookStore } from "../store/orderbook";
import { tickerStore } from "../store/ticker";
import { RecentTradesStore } from "../store/trades";

export { orderBookStore, tickerStore };

export const recentTradesStore = new RecentTradesStore(ENV.RECENT_TRADES_PER_MARKET);
export const tickerAggregator = new TickerAggregator(tickerStore);
export const candleAggregator = new CandleAggregator();
