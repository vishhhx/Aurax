import { Router } from "express";

import {
  Get24HourTicker,
  GetAllTickers,
  GetBookTicker,
  GetMarketBySymbol,
  GetMarketPrice,
  GetMarketStatus,
  GetOrderBookDepth,
  GetTickerBySymbol,
  ListALlMarkets,
  healthCheck,
} from "../controllers/market";

export const marketRouter = Router();

marketRouter.get("/health", healthCheck());
marketRouter.get("/markets", ListALlMarkets);
marketRouter.get("/markets/:symbol", GetMarketBySymbol);
marketRouter.get("/markets/:symbol/orderbook", GetOrderBookDepth);
marketRouter.get("/markets/:symbol/ticker/24hr", Get24HourTicker);
marketRouter.get("/markets/:symbol/status", GetMarketStatus);
marketRouter.get("/markets/:symbol/price", GetMarketPrice);
marketRouter.get("/markets/:symbol/bookTicker", GetBookTicker);
marketRouter.get("/tickers", GetAllTickers);
marketRouter.get("/markets/:symbol/ticker", GetTickerBySymbol);
