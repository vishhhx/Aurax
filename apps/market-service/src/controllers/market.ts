import type { Request, Response } from "express";

import { ApiReponse, asyncHandler } from "@repo/core/rest";

import { marketRepo } from "../repositories/market";
import { marketsStore } from "../store/markets";
import { tickerStore } from "../store/ticker";

const getSymbol = (req: Request): string | undefined => {
  const symbol = req.params.symbol;
  return typeof symbol === "string" && symbol.length > 0 ? symbol : undefined;
};

export const healthCheck = () =>
  asyncHandler(async (_req: Request, res: Response) => {
    return res.status(200).json(new ApiReponse(true, "Route is healthy"));
  });

export const ListALlMarkets = asyncHandler(
  async (_req: Request, res: Response) => {
    const markets = await marketRepo.listmarkets();

    return res
      .status(200)
      .json(new ApiReponse(true, markets, "Successfully fetched all markets"));
  },
);

export const GetMarketBySymbol = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const market = await marketRepo.getMarketBySymbol(symbol);

    if (!market) {
      return res.status(404).json(new ApiReponse(false, "Market not found"));
    }

    const isRegistered = marketsStore.hasMarket(symbol);

    const orderBook = isRegistered ? marketsStore.getSnapshot(symbol) : null;

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          market,
          orderBook,
        },
        "Successfully fetched market",
      ),
    );
  },
);

export const GetAllTickers = asyncHandler(
  async (_req: Request, res: Response) => {
    const tickers = tickerStore.getAllTickers();

    return res
      .status(200)
      .json(new ApiReponse(true, tickers, "Successfully fetched all tickers"));
  },
);

export const GetTickerBySymbol = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const ticker = tickerStore.getTicker(symbol);

    if (!ticker) {
      return res.status(404).json(new ApiReponse(false, "Ticker not found"));
    }

    return res
      .status(200)
      .json(new ApiReponse(true, ticker, "Successfully fetched ticker"));
  },
);

export const Get24HourTicker = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = getSymbol(req);

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const ticker = tickerStore.getTicker(symbol);

    if (!ticker) {
      return res.status(404).json(new ApiReponse(false, "Ticker not found"));
    }

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          symbol: ticker.symbol,
          lastPrice: ticker.lastPrice,
          openPrice: ticker.open24h,
          highPrice: ticker.high24h,
          lowPrice: ticker.low24h,
          priceChange: ticker.priceChange24h,
          priceChangePercent: ticker.priceChangePercent24h,
          volume: ticker.baseVolume24h,
          quoteVolume: ticker.quoteVolume24h,
          lastTradeTimestamp: ticker.lastTradeTimestamp,
          updatedAt: ticker.updatedAt,
        },
        "24-hour ticker fetched successfully",
      ),
    );
  },
);

export const GetMarketStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = getSymbol(req);

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const registered = marketsStore.hasMarket(symbol);
    const ticker = tickerStore.getTicker(symbol);

    if (!registered && !ticker) {
      return res.status(404).json(new ApiReponse(false, "Market not found"));
    }

    const orderBook = registered ? marketsStore.getSnapshot(symbol) : null;

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          symbol,
          registered,
          orderBookAvailable: orderBook !== null,
          tickerAvailable: ticker !== undefined,
          orderBookSequenceNumber: orderBook?.sequenceNumber ?? null,
        },
        "Market service status fetched successfully",
      ),
    );
  },
);

export const GetMarketPrice = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = getSymbol(req);

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const ticker = tickerStore.getTicker(symbol);

    if (!ticker) {
      return res.status(404).json(new ApiReponse(false, "Ticker not found"));
    }

    if (ticker.lastPrice === null) {
      return res
        .status(404)
        .json(new ApiReponse(false, "No executed trade price available"));
    }

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          symbol: ticker.symbol,
          price: ticker.lastPrice,
          timestamp: ticker.lastTradeTimestamp,
        },
        "Market price fetched successfully",
      ),
    );
  },
);

export const GetBookTicker = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = getSymbol(req);

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    if (!marketsStore.hasMarket(symbol)) {
      return res
        .status(404)
        .json(new ApiReponse(false, "Market order book not found"));
    }

    const orderBook = marketsStore.getSnapshot(symbol);

    const bestBid = orderBook.bids[0];
    const bestAsk = orderBook.asks[0];

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          symbol,
          bidPrice: bestBid?.price ?? null,
          bidQuantity: bestBid?.quantity ?? null,
          askPrice: bestAsk?.price ?? null,
          askQuantity: bestAsk?.quantity ?? null,
          sequenceNumber: orderBook.sequenceNumber,
        },
        "Best bid and ask fetched successfully",
      ),
    );
  },
);

export const GetOrderBookDepth = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return res
        .status(400)
        .json(new ApiReponse(false, "Market symbol is required"));
    }

    const rawLimit = req.query.limit;
    const limit =
      typeof rawLimit === "undefined"
        ? 20
        : Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);

    if (
      typeof rawLimit !== "undefined" &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return res
        .status(400)
        .json(
          new ApiReponse(false, "Limit must be an integer between 1 and 100"),
        );
    }

    if (!marketsStore.hasMarket(symbol)) {
      return res
        .status(404)
        .json(new ApiReponse(false, "Market order book not found"));
    }

    const snapshot = marketsStore.getSnapshot(symbol);

    const bids = snapshot.bids.slice(0, limit);
    const asks = snapshot.asks.slice(0, limit);

    return res.status(200).json(
      new ApiReponse(
        true,
        {
          symbol: snapshot.symbol,
          sequenceNumber: snapshot.sequenceNumber,
          bids,
          asks,
        },
        "Order book depth fetched successfully",
      ),
    );
  },
);
