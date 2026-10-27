import { ApiError, ApiReponse, asyncHandler } from "@repo/core/rest";

import { recentTradesStore } from "../market/state";
import { decodeCursor, tradeRepo } from "../repositories/trades";
import { optionalString, parseLimit, parseRange, requireSymbol } from "./params";

const RECENT_DEFAULT = 50;
const HISTORY_DEFAULT = 100;
const HISTORY_MAX = 1_000;
const TRADE_ID = /^[A-Za-z0-9-]{1,128}$/;

/** Newest-first recent trades from memory (bounded per market). */
export const getRecentTrades = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const limit = parseLimit(req.query.limit, { def: RECENT_DEFAULT, max: recentTradesStore.maxTradesPerMarket });

  res
    .status(200)
    .json(new ApiReponse(true, recentTradesStore.getRecentTrades(symbol, limit), "Recent trades fetched successfully"));
});

/**
 * Newest-first public trade history from MarketTrade, keyset-paginated on
 * (timestamp, tradeId). Pass `nextCursor` back as `cursor` for the next page.
 */
export const getHistoricalTrades = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const limit = parseLimit(req.query.limit, { def: HISTORY_DEFAULT, max: HISTORY_MAX });
  const { startTime, endTime } = parseRange(req.query);
  const cursorText = optionalString(req.query.cursor, "cursor");
  const cursor = cursorText === undefined ? undefined : decodeCursor(cursorText);

  if (cursorText !== undefined && !cursor) {
    throw new ApiError(400, "Invalid cursor", ["cursor must be a nextCursor value returned by this endpoint"]);
  }

  const page = await tradeRepo.listHistorical({ symbol, limit, startTime, endTime, cursor: cursor ?? undefined });

  res.status(200).json(
    new ApiReponse(true, { trades: page.trades, nextCursor: page.nextCursor, limit }, "Historical trades fetched successfully"),
  );
});

export const getTradeById = asyncHandler(async (req, res) => {
  const symbol = requireSymbol(req);
  const tradeId = String(req.params.tradeId ?? "");

  if (!TRADE_ID.test(tradeId)) {
    throw new ApiError(400, "Invalid trade ID");
  }

  const trade = await tradeRepo.findById(symbol, tradeId);
  if (!trade) throw new ApiError(404, "Trade not found");

  res.status(200).json(new ApiReponse(true, trade, "Trade fetched successfully"));
});
