export interface PublicTrade {
  /** Matching-engine execution ID */
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  /** Taker (aggressor) side */
  side: "BUY" | "SELL";
  /** True when the resting (maker) order was the buy side */
  isBuyerMaker: boolean;
  /** Engine execution time, Unix ms */
  timestamp: number;
}

export type RecentTrade = PublicTrade;

interface MarketTrades {
  /** Newest first, ordered by (timestamp desc, tradeId desc) */
  trades: RecentTrade[];
  tradeIds: Set<string>;
}

function isNewer(a: RecentTrade, b: RecentTrade): boolean {
  return a.timestamp > b.timestamp || (a.timestamp === b.timestamp && a.tradeId > b.tradeId);
}

/** Bounded, deduplicated newest-first trade list per market. */
export class RecentTradesStore {
  private readonly markets = new Map<string, MarketTrades>();

  constructor(readonly maxTradesPerMarket = 100) {
    if (!Number.isInteger(maxTradesPerMarket) || maxTradesPerMarket < 1) {
      throw new Error("maxTradesPerMarket must be a positive integer");
    }
  }

  private getOrCreateMarket(symbol: string): MarketTrades {
    let market = this.markets.get(symbol);

    if (!market) {
      market = { trades: [], tradeIds: new Set<string>() };
      this.markets.set(symbol, market);
    }

    return market;
  }

  public addTrade(trade: RecentTrade): boolean {
    const market = this.getOrCreateMarket(trade.symbol);

    if (market.tradeIds.has(trade.tradeId)) {
      return false;
    }

    const oldest = market.trades[market.trades.length - 1];
    if (
      market.trades.length >= this.maxTradesPerMarket &&
      oldest &&
      !isNewer(trade, oldest)
    ) {
      // Older than everything retained; it would be evicted immediately.
      return false;
    }

    const storedTrade = { ...trade };
    const index = market.trades.findIndex((existing) => isNewer(storedTrade, existing));

    if (index === -1) {
      market.trades.push(storedTrade);
    } else {
      market.trades.splice(index, 0, storedTrade);
    }

    market.tradeIds.add(storedTrade.tradeId);

    while (market.trades.length > this.maxTradesPerMarket) {
      const removed = market.trades.pop();
      if (removed) market.tradeIds.delete(removed.tradeId);
    }

    return true;
  }

  public getRecentTrades(symbol: string, limit = 50): RecentTrade[] {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("limit must be a non-negative integer");
    }

    const market = this.markets.get(symbol);

    if (!market || limit === 0) {
      return [];
    }

    return market.trades.slice(0, limit).map((trade) => ({ ...trade }));
  }

  public getLatestTrade(symbol: string): RecentTrade | undefined {
    const trade = this.markets.get(symbol)?.trades[0];
    return trade ? { ...trade } : undefined;
  }

  public clearMarket(symbol: string): boolean {
    return this.markets.delete(symbol);
  }

  public clear(): void {
    this.markets.clear();
  }
}
