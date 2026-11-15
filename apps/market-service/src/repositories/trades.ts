import { fromDbDecimal } from "../lib/decimal";
import { prisma } from "@repo/pg";
import type { PublicTrade } from "../store/trades";

type MarketTradeRow = {
  tradeId: string;
  symbol: string;
  price: { toFixed(): string };
  quantity: { toFixed(): string };
  quoteAmount: { toFixed(): string };
  side: "BUY" | "SELL";
  executedAt: bigint;
};

const SELECT = {
  tradeId: true,
  symbol: true,
  price: true,
  quantity: true,
  quoteAmount: true,
  side: true,
  executedAt: true,
} as const;

export function rowToTrade(row: MarketTradeRow): PublicTrade {
  return {
    tradeId: row.tradeId,
    symbol: row.symbol,
    price: fromDbDecimal(row.price),
    quantity: fromDbDecimal(row.quantity),
    quoteQuantity: fromDbDecimal(row.quoteAmount),
    side: row.side,
    // MarketTrade stores the taker side; the maker is on the opposite side.
    isBuyerMaker: row.side === "SELL",
    timestamp: Number(row.executedAt),
  };
}

export interface TradeCursor {
  timestamp: number;
  tradeId: string;
}

export function encodeCursor(c: TradeCursor): string {
  return Buffer.from(`${c.timestamp}:${c.tradeId}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string): TradeCursor | null {
  try {
    const text = Buffer.from(value, "base64url").toString("utf8");
    const sep = text.indexOf(":");
    const timestamp = Number(text.slice(0, sep));
    const tradeId = text.slice(sep + 1);
    if (sep < 1 || !Number.isSafeInteger(timestamp) || timestamp < 0 || !tradeId) return null;
    return { timestamp, tradeId };
  } catch {
    return null;
  }
}

class TradeRepository {
  /**
   * Durable, idempotent record of an engine execution. Returns true when the
   * row was newly inserted and false when the trade ID already existed — the
   * cross-restart deduplication point for Kafka redeliveries.
   */
  async insertIfAbsent(trade: PublicTrade): Promise<boolean> {
    const inserted = await prisma.$executeRaw`
      INSERT INTO "MarketTrade" ("tradeId", "symbol", "price", "quantity", "quoteAmount", "side", "executedAt")
      VALUES (
        ${trade.tradeId}, ${trade.symbol},
        ${trade.price}::numeric, ${trade.quantity}::numeric, ${trade.quoteQuantity}::numeric,
        ${trade.side}::"OrderSide", ${BigInt(trade.timestamp)}
      )
      ON CONFLICT ("tradeId") DO NOTHING`;
    return inserted === 1;
  }

  async findById(symbol: string, tradeId: string): Promise<PublicTrade | null> {
    const row = await prisma.marketTrade.findFirst({ where: { tradeId, symbol }, select: SELECT });
    return row ? rowToTrade(row) : null;
  }

  /**
   * Newest-first keyset pagination on (executedAt, tradeId), served by the
   * `MarketTrade_symbol_executedAt_tradeId_idx` index.
   */
  async listHistorical(params: {
    symbol: string;
    limit: number;
    startTime?: number;
    endTime?: number;
    cursor?: TradeCursor;
  }): Promise<{ trades: PublicTrade[]; nextCursor: string | null }> {
    const { symbol, limit, startTime, endTime, cursor } = params;

    const rows = await prisma.marketTrade.findMany({
      where: {
        symbol,
        ...(startTime !== undefined || endTime !== undefined
          ? {
              executedAt: {
                ...(startTime !== undefined ? { gte: BigInt(startTime) } : {}),
                ...(endTime !== undefined ? { lte: BigInt(endTime) } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { executedAt: { lt: BigInt(cursor.timestamp) } },
                { executedAt: BigInt(cursor.timestamp), tradeId: { lt: cursor.tradeId } },
              ],
            }
          : {}),
      },
      orderBy: [{ executedAt: "desc" }, { tradeId: "desc" }],
      take: limit + 1,
      select: SELECT,
    });

    const page = rows.slice(0, limit).map(rowToTrade);
    const last = page[page.length - 1];
    return {
      trades: page,
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
    };
  }

  /** Most recent trade per symbol, regardless of age. Seeds `lastPrice` for quiet markets on startup. */
  async latestPerSymbol(symbols: string[]): Promise<PublicTrade[]> {
    const rows = await Promise.all(
      symbols.map((symbol) =>
        prisma.marketTrade.findFirst({
          where: { symbol },
          orderBy: [{ executedAt: "desc" }, { tradeId: "desc" }],
          select: SELECT,
        }),
      ),
    );
    return rows.flatMap((r) => (r ? [rowToTrade(r)] : []));
  }

  /** Ascending (executedAt, tradeId) scan used for startup reconstruction. */
  async *streamSince(symbols: string[], since: number, batchSize = 5_000): AsyncGenerator<PublicTrade[]> {
    let after: TradeCursor | null = null;

    while (true) {
      const rows: MarketTradeRow[] = await prisma.marketTrade.findMany({
        where: {
          symbol: { in: symbols },
          executedAt: { gte: BigInt(since) },
          ...(after
            ? {
                OR: [
                  { executedAt: { gt: BigInt(after.timestamp) } },
                  { executedAt: BigInt(after.timestamp), tradeId: { gt: after.tradeId } },
                ],
              }
            : {}),
        },
        orderBy: [{ executedAt: "asc" }, { tradeId: "asc" }],
        take: batchSize,
        select: SELECT,
      });

      if (rows.length === 0) return;

      const trades = rows.map(rowToTrade);
      yield trades;

      const last = trades[trades.length - 1]!;
      after = { timestamp: last.timestamp, tradeId: last.tradeId };
      if (rows.length < batchSize) return;
    }
  }
}

export const tradeRepo = new TradeRepository();
