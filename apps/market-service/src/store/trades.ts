export interface RecentTrade {
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  timestamp: number;
  side?: "BUY" | "SELL";
}

interface MarketTrades {
  trades: RecentTrade[];
  tradeIds: Set<string>;
}

export class RecentTradesStore {
  private readonly markets = new Map<string, MarketTrades>();

  constructor(private readonly maxTradesPerMarket = 100) {
    if (!Number.isInteger(maxTradesPerMarket) || maxTradesPerMarket < 1) {
      throw new Error("maxTradesPerMarket must be a positive integer");
    }
  }

  private getOrCreateMarket(symbol: string): MarketTrades {
    let market = this.markets.get(symbol);

    if (!market) {
      market = {
        trades: [],
        tradeIds: new Set<string>(),
      };

      this.markets.set(symbol, market);
    }

    return market;
  }

  public addTrade(trade: RecentTrade): boolean {
    const market = this.getOrCreateMarket(trade.symbol);

    if (market.tradeIds.has(trade.tradeId)) {
      return false;
    }

    const storedTrade = { ...trade };

    const index = market.trades.findIndex(
      (existing) => existing.timestamp < storedTrade.timestamp,
    );

    if (index === -1) {
      market.trades.push(storedTrade);
    } else {
      market.trades.splice(index, 0, storedTrade);
    }

    market.tradeIds.add(storedTrade.tradeId);

    while (market.trades.length > this.maxTradesPerMarket) {
      const removed = market.trades.pop();

      if (removed) {
        market.tradeIds.delete(removed.tradeId);
      }
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

  public getMarketSymbols(): string[] {
    return Array.from(this.markets.keys());
  }

  public clearMarket(symbol: string): boolean {
    return this.markets.delete(symbol);
  }

  public clear(): void {
    this.markets.clear();
  }
}

export const recentTradesStore = new RecentTradesStore(100);
