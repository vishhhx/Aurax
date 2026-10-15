import { prisma } from "@repo/pg";
import { tickerAggregator } from "../processors/tickers";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export const reconstructTickerStates = async (
  markets: string[],
): Promise<void> => {
  if (markets.length === 0) return;

  const now = Date.now();
  const cutoff = new Date(now - WINDOW_MS);

  const historicalTrades = await prisma.trade.findMany({
    where: {
      symbol: { in: markets },
      createdAt: {
        gte: cutoff,
        lte: new Date(now),
      },
    },
    select: {
      tradeId: true,
      symbol: true,
      price: true,
      quantity: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { tradeId: "asc" }],
  });

  tickerAggregator.reconstructMarkets(
    markets,
    historicalTrades.map((trade) => ({
      event: "trade.executed" as const,
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      price: trade.price.toString(),
      quantity: trade.quantity.toString(),
      timestamp: trade.createdAt.getTime(),
    })),
  );

  console.log(
    `Reconstructed ticker states from ${historicalTrades.length} historical trades`,
  );
};
