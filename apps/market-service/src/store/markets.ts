import { MarketOrderBook, type OrderBookState } from "./orderbook";

export class MarketsStore {
  private readonly markets = new Map<string, MarketOrderBook>();

  public register(symbol: string): MarketOrderBook {
    const existing = this.markets.get(symbol);

    if (existing) {
      return existing;
    }

    const market = new MarketOrderBook(symbol);
    this.markets.set(symbol, market);

    return market;
  }

  public initialize(snapshot: OrderBookState): void {
    this.register(snapshot.symbol).initialize(snapshot);
  }

  public update(snapshot: OrderBookState): boolean {
    const market = this.markets.get(snapshot.symbol);

    if (!market) {
      throw new Error(`Market not registered: ${snapshot.symbol}`);
    }

    return market.update(snapshot);
  }

  public getMarket(symbol: string): MarketOrderBook {
    const market = this.markets.get(symbol);

    if (!market) {
      throw new Error(`Market not found: ${symbol}`);
    }

    return market;
  }

  public getSnapshot(symbol: string): OrderBookState {
    return this.getMarket(symbol).getSnapshot();
  }

  public getSymbols(): string[] {
    return [...this.markets.keys()];
  }

  public hasMarket(symbol: string): boolean {
    return this.markets.has(symbol);
  }
}

export const marketsStore = new MarketsStore();
