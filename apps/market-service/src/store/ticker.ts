export interface TickerState {
  symbol: string;
  lastPrice: string | null;
  open24h: string | null;
  high24h: string | null;
  low24h: string | null;
  priceChange24h: string | null;
  priceChangePercent24h: string | null;
  baseVolume24h: string;
  quoteVolume24h: string;
  lastTradeTimestamp: number | null;
  sequenceNumber: bigint;
  updatedAt: number;
}

export class TickerStore {
  private readonly tickers = new Map<string, TickerState>();

  private createInitialTicker(symbol: string): TickerState {
    return {
      symbol,
      lastPrice: null,
      open24h: null,
      high24h: null,
      low24h: null,
      priceChange24h: null,
      priceChangePercent24h: null,
      baseVolume24h: "0",
      quoteVolume24h: "0",
      lastTradeTimestamp: null,
      sequenceNumber: 0n,
      updatedAt: Date.now(),
    };
  }

  getTicker(symbol: string): TickerState | undefined {
    return this.tickers.get(symbol);
  }

  getOrCreateTicker(symbol: string): TickerState {
    let ticker = this.tickers.get(symbol);

    if (!ticker) {
      ticker = this.createInitialTicker(symbol);
      this.tickers.set(symbol, ticker);
    }

    return ticker;
  }

  setTicker(symbol: string, ticker: TickerState): void {
    this.tickers.set(symbol, { ...ticker, symbol });
  }

  updateTicker(
    symbol: string,
    updates: Partial<Omit<TickerState, "symbol">>,
  ): TickerState {
    const current = this.getOrCreateTicker(symbol);

    const updated: TickerState = {
      ...current,
      ...updates,
      symbol,
      updatedAt: Date.now(),
    };

    this.tickers.set(symbol, updated);

    return updated;
  }

  getAllTickers(): TickerState[] {
    return Array.from(this.tickers.values());
  }

  deleteTicker(symbol: string): boolean {
    return this.tickers.delete(symbol);
  }

  clear(): void {
    this.tickers.clear();
  }
}

export const tickerStore = new TickerStore();
