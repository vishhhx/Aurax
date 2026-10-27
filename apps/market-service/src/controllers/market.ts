import type { Request, Response } from "express";
import { ApiError, ApiReponse, asyncHandler } from "@repo/core/rest";

import { ENV } from "../config/env";
import { metrics } from "../lib/metrics";
import { health } from "../health";
import { marketRegistry } from "../market/registry";
import { candleAggregator, orderBookStore, tickerStore } from "../market/state";
import { CANDLE_INTERVALS, isCandleInterval, type Candle } from "../processors/candle";
import { listCandles } from "../repositories/candles";
import type { TickerState } from "../store/ticker";
import { parseLimit, parseRange, requireSymbol } from "./params";

const DEPTH_DEFAULT = 20;
const DEPTH_MAX = 500;
const CANDLES_DEFAULT = 500;
const CANDLES_MAX = 1_000;

function serializeTicker(t: TickerState) {
  return {
    symbol: t.symbol,
    lastPrice: t.lastPrice,
    openPrice: t.open24h,
    highPrice: t.high24h,
    lowPrice: t.low24h,
    priceChange: t.priceChange24h,
    priceChangePercent: t.priceChangePercent24h,
    volume: t.baseVolume24h,
    quoteVolume: t.quoteVolume24h,
    tradeCount: t.tradeCount24h,
    lastTradeTimestamp: t.lastTradeTimestamp,
    windowStart: t.windowStart,
    sequenceNumber: t.sequenceNumber.toString(),
    updatedAt: t.updatedAt,
  };
}

function tickerOr503(symbol: string): TickerState {
  const ticker = tickerStore.getTicker(symbol);
  if (!ticker) throw new ApiError(503, `Ticker for ${symbol} is not initialised yet`);
  return ticker;
}

function bookOr503(symbol: string) {
  const book = orderBookStore.get(symbol);
  if (!book) throw new ApiError(503, `Order book for ${symbol} is not available yet`);
  return book;
}

// ─── Health & metrics (not readiness-gated) ──────────────────────────────

export const liveness = (_req: Request, res: Response) => {
  res.status(200).json(new ApiReponse(true, { status: "live" }, "Service is live"));
};

export const readiness = (_req: Request, res: Response) => {
  const snapshot = health.snapshot();
  res
    .status(snapshot.ready ? 200 : 503)
    .json(new ApiReponse(snapshot.ready, snapshot, snapshot.ready ? "Service is ready" : "Service is not ready"));
};

export const metricsEndpoint = (_req: Request, res: Response) => {
  res.type("text/plain; version=0.0.4").send(metrics.render());
};

// ─── Markets ─────────────────────────────────────────────────────────────

export const listMarkets = asyncHandler(async (_req, res) => {
  res.status(200).json(new ApiReponse(true, marketRegistry.list(), "Markets fetched successfully"));
});

export const getMarket = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  res.status(200).json(new ApiReponse(true, marketRegistry.get(symbol), "Market fetched successfully"));
});

/** Trading status from Postgres plus local data availability. */
export const getMarketStatus = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const market = marketRegistry.get(symbol)!;
  const book = orderBookStore.get(symbol);
  const ticker = tickerStore.getTicker(symbol);

  res.status(200).json(
    new ApiReponse(
      true,
      {
        symbol,
        status: market.status,
        orderBookSequenceNumber: book ? book.sequenceNumber.toString() : null,
        orderBookUpdatedAt: book?.updatedAt ?? null,
        lastTradeTimestamp: ticker?.lastTradeTimestamp ?? null,
      },
      "Market status fetched successfully",
    ),
  );
});

// ─── Order book ──────────────────────────────────────────────────────────

/**
 * `?view=published` returns exactly the top-N view that depth.updated deltas
 * describe (N = DEPTH_PUBLISH_LEVELS, echoed as `depth`), so a consumer can
 * resync without knowing N in advance.
 */
export const getOrderBookDepth = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const published = req.query.view === "published";
  const limit = published ? ENV.DEPTH_PUBLISH_LEVELS : parseLimit(req.query.limit, { def: DEPTH_DEFAULT, max: DEPTH_MAX });
  const book = bookOr503(symbol);

  res.status(200).json(
    new ApiReponse(
      true,
      {
        symbol,
        sequenceNumber: book.sequenceNumber.toString(),
        bids: book.bids.slice(0, limit),
        asks: book.asks.slice(0, limit),
        depth: limit,
        updatedAt: book.updatedAt,
      },
      "Order book depth fetched successfully",
    ),
  );
});

export const getBookTicker = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const book = bookOr503(symbol);
  const bid = book.bids[0];
  const ask = book.asks[0];

  res.status(200).json(
    new ApiReponse(
      true,
      {
        symbol,
        bidPrice: bid?.price ?? null,
        bidQuantity: bid?.quantity ?? null,
        askPrice: ask?.price ?? null,
        askQuantity: ask?.quantity ?? null,
        sequenceNumber: book.sequenceNumber.toString(),
      },
      "Best bid and ask fetched successfully",
    ),
  );
});

// ─── Tickers & price ─────────────────────────────────────────────────────

export const listTickers = asyncHandler(async (_req, res) => {
  const tickers = marketRegistry
    .symbols()
    .flatMap((s) => {
      const t = tickerStore.getTicker(s);
      return t ? [serializeTicker(t)] : [];
    });
  res.status(200).json(new ApiReponse(true, tickers, "Tickers fetched successfully"));
});

export const getTicker = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  res.status(200).json(new ApiReponse(true, serializeTicker(tickerOr503(symbol)), "24-hour ticker fetched successfully"));
});

export const getPrice = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const ticker = tickerOr503(symbol);

  res.status(200).json(
    new ApiReponse(
      true,
      { symbol, price: ticker.lastPrice, timestamp: ticker.lastTradeTimestamp },
      ticker.lastPrice === null ? "No trade has executed in this market yet" : "Market price fetched successfully",
    ),
  );
});

// ─── Candles ─────────────────────────────────────────────────────────────

/**
 * Oldest-first candles. Persisted candles come from Postgres; anything still
 * in memory (current and recent periods, including unpersisted revisions)
 * overrides the stored row for the same openTime.
 */
export const getCandles = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const interval = req.query.interval;

  if (!isCandleInterval(interval)) {
    throw new ApiError(400, "Invalid interval", [`interval must be one of ${Object.keys(CANDLE_INTERVALS).join(", ")}`]);
  }

  const limit = parseLimit(req.query.limit, { def: CANDLES_DEFAULT, max: CANDLES_MAX });
  const { startTime, endTime } = parseRange(req.query);

  const memory = candleAggregator.getCandles(symbol, interval, { limit, startTime, endTime });
  const stored = await listCandles({ symbol, interval, limit, startTime, endTime });

  const merged = new Map<number, Candle>();
  for (const c of stored) merged.set(c.openTime, c);
  for (const c of memory) merged.set(c.openTime, c);

  const candles = [...merged.values()].sort((a, b) => a.openTime - b.openTime).slice(-limit);

  res.status(200).json(
    new ApiReponse(
      true,
      candles.map(({ updatedAt: _u, ...c }) => c),
      "Candles fetched successfully",
    ),
  );
});
