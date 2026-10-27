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
  tradeCount24h: number;
  lastTradeTimestamp: number | null;
  /** Start of the rolling window used for these values (Unix ms, exclusive) */
  windowStart: number;
  /** Per-symbol revision, incremented on every change */
  sequenceNumber: bigint;
  updatedAt: number;
}

export type TickerValues = Omit<TickerState, "symbol" | "sequenceNumber" | "updatedAt">;

const VALUE_KEYS: Array<keyof TickerValues> = [
  "lastPrice",
  "open24h",
  "high24h",
  "low24h",
  "priceChange24h",
  "priceChangePercent24h",
  "baseVolume24h",
  "quoteVolume24h",
  "tradeCount24h",
  "lastTradeTimestamp",
];

export class TickerStore {
  private readonly tickers = new Map<string, TickerState>();

  getTicker(symbol: string): TickerState | undefined {
    return this.tickers.get(symbol);
  }

  /**
   * Writes new values. Returns the stored ticker and whether any market value
   * (not just `windowStart`) changed, so callers can avoid publishing no-ops.
   */
  update(symbol: string, values: TickerValues): { ticker: TickerState; changed: boolean } {
    const current = this.tickers.get(symbol);
    const changed = !current || VALUE_KEYS.some((key) => current[key] !== values[key]);

    const ticker: TickerState = {
      symbol,
      ...values,
      sequenceNumber: current ? (changed ? current.sequenceNumber + 1n : current.sequenceNumber) : 1n,
      updatedAt: changed || !current ? Date.now() : current.updatedAt,
    };

    this.tickers.set(symbol, ticker);
    return { ticker, changed };
  }

  getAllTickers(): TickerState[] {
    return Array.from(this.tickers.values());
  }

  clear(): void {
    this.tickers.clear();
  }
}

export const tickerStore = new TickerStore();
