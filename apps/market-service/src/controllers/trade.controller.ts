import type { Request, Response } from "express";
import { ApiReponse, asyncHandler } from "@repo/core/rest";
import { HttpStatusCode } from "axios";
import { prisma } from "@repo/pg";

import { recentTradesStore } from "../store/trades";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(
  value: unknown,
  defaultValue = DEFAULT_LIMIT,
): number | null {
  if (value === undefined) return defaultValue;

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return null;
  }

  return limit;
}

function parseTimestamp(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") return null;

  const timestamp = Number(value);

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

function invalidResponse(res: Response, message: string) {
  return res
    .status(HttpStatusCode.BadRequest)
    .json(new ApiReponse(false, message));
}

export const GetRecentTrades = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return invalidResponse(res, "Market symbol is required");
    }

    const limit = parseLimit(req.query.limit);

    if (limit === null) {
      return invalidResponse(res, "Limit must be an integer between 1 and 100");
    }

    const trades = recentTradesStore.getRecentTrades(symbol, limit);

    return res.status(HttpStatusCode.Ok).json(
      new ApiReponse(
        true,
        trades.map((trade) => ({
          tradeId: trade.tradeId,
          symbol: trade.symbol,
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.timestamp,
          side: trade.side ?? null,
        })),
        "Recent trades fetched successfully",
      ),
    );
  },
);

export const GetTradeById = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");
    const tradeId = String(req.params.tradeId ?? "");

    if (!symbol || !tradeId) {
      return invalidResponse(res, "Symbol and trade ID are required");
    }

    const trade = await prisma.trade.findFirst({
      where: {
        symbol,
        tradeId,
      },
      select: {
        tradeId: true,
        executionId: true,
        symbol: true,
        price: true,
        quantity: true,
        quoteAmount: true,
        side: true,
        createdAt: true,
      },
    });

    if (!trade) {
      return res
        .status(HttpStatusCode.NotFound)
        .json(new ApiReponse(false, "Trade not found"));
    }

    return res.status(HttpStatusCode.Ok).json(
      new ApiReponse(
        true,
        {
          ...trade,
          price: trade.price.toString(),
          quantity: trade.quantity.toString(),
          quoteAmount: trade.quoteAmount.toString(),
          timestamp: trade.createdAt.getTime(),
        },
        "Trade fetched successfully",
      ),
    );
  },
);

export const GetHistoricalTrades = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return invalidResponse(res, "Market symbol is required");
    }

    const limit = parseLimit(req.query.limit);

    if (limit === null) {
      return invalidResponse(res, "Limit must be an integer between 1 and 100");
    }

    const startTime = parseTimestamp(req.query.startTime);
    const endTime = parseTimestamp(req.query.endTime);

    if (startTime === null || endTime === null) {
      return invalidResponse(
        res,
        "startTime and endTime must be valid Unix timestamps in milliseconds",
      );
    }

    if (
      startTime instanceof Date &&
      endTime instanceof Date &&
      startTime.getTime() > endTime.getTime()
    ) {
      return invalidResponse(res, "startTime cannot be after endTime");
    }

    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    if (req.query.cursor !== undefined && !cursor) {
      return invalidResponse(res, "Cursor must be a trade ID");
    }

    if (cursor) {
      const cursorTrade = await prisma.trade.findFirst({
        where: { tradeId: cursor, symbol },
        select: { tradeId: true },
      });

      if (!cursorTrade) {
        return invalidResponse(
          res,
          "Cursor trade does not exist for this market",
        );
      }
    }

    const trades = await prisma.trade.findMany({
      where: {
        symbol,
        ...(startTime instanceof Date || endTime instanceof Date
          ? {
              createdAt: {
                ...(startTime instanceof Date ? { gte: startTime } : {}),
                ...(endTime instanceof Date ? { lte: endTime } : {}),
              },
            }
          : {}),
      },
      ...(cursor ? { cursor: { tradeId: cursor }, skip: 1 } : {}),
      take: limit,
      orderBy: [{ createdAt: "desc" }, { tradeId: "desc" }],
      select: {
        tradeId: true,
        executionId: true,
        symbol: true,
        price: true,
        quantity: true,
        quoteAmount: true,
        side: true,
        createdAt: true,
      },
    });

    return res.status(HttpStatusCode.Ok).json(
      new ApiReponse(
        true,
        {
          trades: trades.map((trade) => ({
            ...trade,
            price: trade.price.toString(),
            quantity: trade.quantity.toString(),
            quoteAmount: trade.quoteAmount.toString(),
            timestamp: trade.createdAt.getTime(),
          })),
          nextCursor:
            trades.length === limit
              ? (trades[trades.length - 1]?.tradeId ?? null)
              : null,
          limit,
        },
        "Historical trades fetched successfully",
      ),
    );
  },
);

export const GetTradeCount = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return invalidResponse(res, "Market symbol is required");
    }

    const startTime = parseTimestamp(req.query.startTime);
    const endTime = parseTimestamp(req.query.endTime);

    if (startTime === null || endTime === null) {
      return invalidResponse(
        res,
        "startTime and endTime must be valid Unix timestamps in milliseconds",
      );
    }

    if (
      startTime instanceof Date &&
      endTime instanceof Date &&
      startTime.getTime() > endTime.getTime()
    ) {
      return invalidResponse(res, "startTime cannot be after endTime");
    }

    const count = await prisma.trade.count({
      where: {
        symbol,
        ...(startTime instanceof Date || endTime instanceof Date
          ? {
              createdAt: {
                ...(startTime instanceof Date ? { gte: startTime } : {}),
                ...(endTime instanceof Date ? { lte: endTime } : {}),
              },
            }
          : {}),
      },
    });

    return res
      .status(HttpStatusCode.Ok)
      .json(
        new ApiReponse(
          true,
          { symbol, count },
          "Trade count fetched successfully",
        ),
      );
  },
);

export const GetAggregateTrades = asyncHandler(
  async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol ?? "");

    if (!symbol) {
      return invalidResponse(res, "Market symbol is required");
    }

    const limit = parseLimit(req.query.limit);

    if (limit === null) {
      return invalidResponse(res, "Limit must be an integer between 1 and 100");
    }

    const startTime = parseTimestamp(req.query.startTime);
    const endTime = parseTimestamp(req.query.endTime);

    if (startTime === null || endTime === null) {
      return invalidResponse(
        res,
        "startTime and endTime must be valid Unix timestamps in milliseconds",
      );
    }

    if (
      startTime instanceof Date &&
      endTime instanceof Date &&
      startTime.getTime() > endTime.getTime()
    ) {
      return invalidResponse(res, "startTime cannot be after endTime");
    }

    const trades = await prisma.trade.findMany({
      where: {
        symbol,
        ...(startTime instanceof Date || endTime instanceof Date
          ? {
              createdAt: {
                ...(startTime instanceof Date ? { gte: startTime } : {}),
                ...(endTime instanceof Date ? { lte: endTime } : {}),
              },
            }
          : {}),
      },
      take: Math.min(limit * 10, 1000),
      orderBy: [{ createdAt: "desc" }, { tradeId: "desc" }],
      select: {
        tradeId: true,
        symbol: true,
        price: true,
        quantity: true,
        quoteAmount: true,
        createdAt: true,
      },
    });

    const aggregated: Array<{
      symbol: string;
      price: string;
      quantity: string;
      quoteAmount: string;
      firstTradeId: string;
      lastTradeId: string;
      timestamp: number;
      tradeCount: number;
    }> = [];

    for (const trade of trades) {
      const price = trade.price.toString();
      const previous = aggregated[aggregated.length - 1];

      if (previous && previous.price === price) {
        previous.quantity = (
          Number(previous.quantity) + Number(trade.quantity.toString())
        ).toString();
        previous.quoteAmount = (
          Number(previous.quoteAmount) + Number(trade.quoteAmount.toString())
        ).toString();
        previous.lastTradeId = trade.tradeId;
        previous.tradeCount += 1;
        continue;
      }

      aggregated.push({
        symbol: trade.symbol,
        price,
        quantity: trade.quantity.toString(),
        quoteAmount: trade.quoteAmount.toString(),
        firstTradeId: trade.tradeId,
        lastTradeId: trade.tradeId,
        timestamp: trade.createdAt.getTime(),
        tradeCount: 1,
      });
    }

    return res
      .status(HttpStatusCode.Ok)
      .json(
        new ApiReponse(
          true,
          aggregated.slice(0, limit),
          "Aggregate trades fetched successfully",
        ),
      );
  },
);
