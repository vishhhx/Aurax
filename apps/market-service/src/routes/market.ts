import { Router } from "express";

import {
  getBookTicker,
  getCandles,
  getMarket,
  getMarketStatus,
  getOrderBookDepth,
  getPrice,
  getTicker,
  listMarkets,
  listTickers,
  liveness,
  metricsEndpoint,
  readiness,
} from "../controllers/market";
import { getHistoricalTrades, getRecentTrades, getTradeById } from "../controllers/trade.controller";
import { requireReady } from "../middleware/http";

/** Liveness, readiness and metrics; always available. */
export const opsRouter = Router();
opsRouter.get("/health", liveness);
opsRouter.get("/health/live", liveness);
opsRouter.get("/health/ready", readiness);
opsRouter.get("/metrics", metricsEndpoint);

/** Public market data; 503 until market state is initialised. */
export const marketRouter = Router();
marketRouter.use(requireReady);

marketRouter.get("/markets", listMarkets);
marketRouter.get("/tickers", listTickers);

marketRouter.get("/markets/:symbol", getMarket);
marketRouter.get("/markets/:symbol/status", getMarketStatus);
marketRouter.get("/markets/:symbol/orderbook", getOrderBookDepth);
marketRouter.get("/markets/:symbol/bookTicker", getBookTicker);
marketRouter.get("/markets/:symbol/ticker", getTicker);
marketRouter.get("/markets/:symbol/ticker/24hr", getTicker);
marketRouter.get("/markets/:symbol/price", getPrice);
marketRouter.get("/markets/:symbol/candles", getCandles);
marketRouter.get("/markets/:symbol/trades", getRecentTrades);
marketRouter.get("/markets/:symbol/historical-trades", getHistoricalTrades);
marketRouter.get("/markets/:symbol/trades/:tradeId", getTradeById);
