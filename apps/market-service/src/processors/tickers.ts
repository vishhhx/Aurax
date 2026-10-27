import { formatScaled, mulScaled, percentChangeScaled, toScaled } from "../lib/decimal";
import type { TickerState, TickerStore, TickerValues } from "../store/ticker";
import type { PublicTrade } from "../store/trades";

/**
 * Rolling 24-hour ticker.
 *
 * Window semantics: a trade is inside the window when
 * `now - WINDOW_MS < trade.timestamp`, using the engine execution timestamp.
 * `open24h` is the price of the earliest trade inside the window, ordered by
 * (timestamp, tradeId). `lastPrice` is the latest trade ever seen, so it stays
 * available after a quiet 24 hours (the change/volume fields then reset).
 *
 * Volumes are maintained as running sums; high/low are rescanned only when an
 * expiring trade was the current extreme.
 */
export const TICKER_WINDOW_MS = 24 * 60 * 60 * 1000;

interface WindowTrade {
  tradeId: string;
  timestamp: number;
  price: bigint;
  quantity: bigint;
  quote: bigint;
}

interface LastTrade {
  tradeId: string;
  timestamp: number;
  price: bigint;
}

function before(a: { timestamp: number; tradeId: string }, b: { timestamp: number; tradeId: string }) {
  return a.timestamp < b.timestamp || (a.timestamp === b.timestamp && a.tradeId < b.tradeId);
}

class RollingWindow {
  /** Sorted ascending by (timestamp, tradeId); entries before `head` are expired. */
  private trades: WindowTrade[] = [];
  private head = 0;
  private readonly ids = new Set<string>();

  baseVolume = 0n;
  quoteVolume = 0n;
  private high: bigint | null = null;
  private low: bigint | null = null;
  private extremesStale = false;
  last: LastTrade | null = null;

  get size(): number {
    return this.trades.length - this.head;
  }

  has(tradeId: string): boolean {
    return this.ids.has(tradeId);
  }

  /** Returns false for duplicates and for trades already outside the window. */
  add(trade: WindowTrade, now: number): boolean {
    if (!this.last || before(this.last, trade)) {
      this.last = { tradeId: trade.tradeId, timestamp: trade.timestamp, price: trade.price };
    }

    if (this.ids.has(trade.tradeId) || trade.timestamp <= now - TICKER_WINDOW_MS) {
      return false;
    }

    // Binary search insertion keeps out-of-order trades correctly placed.
    let lo = this.head;
    let hi = this.trades.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (before(this.trades[mid]!, trade)) lo = mid + 1;
      else hi = mid;
    }
    this.trades.splice(lo, 0, trade);
    this.ids.add(trade.tradeId);

    this.baseVolume += trade.quantity;
    this.quoteVolume += trade.quote;
    if (!this.extremesStale) {
      if (this.high === null || trade.price > this.high) this.high = trade.price;
      if (this.low === null || trade.price < this.low) this.low = trade.price;
    }
    return true;
  }

  /** Drops trades that left the window. Returns true if anything expired. */
  expire(now: number): boolean {
    const cutoff = now - TICKER_WINDOW_MS;
    let expired = false;

    while (this.head < this.trades.length && this.trades[this.head]!.timestamp <= cutoff) {
      const old = this.trades[this.head]!;
      this.baseVolume -= old.quantity;
      this.quoteVolume -= old.quote;
      this.ids.delete(old.tradeId);
      if (old.price === this.high || old.price === this.low) this.extremesStale = true;
      this.head += 1;
      expired = true;
    }

    // Compact occasionally so the backing array does not grow unbounded.
    if (this.head > 1024 && this.head * 2 > this.trades.length) {
      this.trades = this.trades.slice(this.head);
      this.head = 0;
    }

    return expired;
  }

  extremes(): { high: bigint | null; low: bigint | null } {
    if (this.extremesStale) {
      this.high = null;
      this.low = null;
      for (let i = this.head; i < this.trades.length; i++) {
        const p = this.trades[i]!.price;
        if (this.high === null || p > this.high) this.high = p;
        if (this.low === null || p < this.low) this.low = p;
      }
      this.extremesStale = false;
    }
    return { high: this.high, low: this.low };
  }

  first(): WindowTrade | undefined {
    return this.trades[this.head];
  }
}

export class TickerAggregator {
  private readonly windows = new Map<string, RollingWindow>();

  constructor(private readonly store: TickerStore) {}

  private window(symbol: string): RollingWindow {
    let w = this.windows.get(symbol);
    if (!w) {
      w = new RollingWindow();
      this.windows.set(symbol, w);
    }
    return w;
  }

  /** Ensures a (possibly empty) ticker exists for each symbol. */
  register(symbols: string[], now = Date.now()): void {
    for (const symbol of symbols) this.recompute(symbol, now);
  }

  /**
   * Folds a trade into the rolling window. Returns the ticker and whether its
   * values changed (false for duplicates and trades outside the window that do
   * not move `lastPrice`).
   */
  processTrade(trade: PublicTrade, now = Date.now()): { ticker: TickerState; changed: boolean } {
    const w = this.window(trade.symbol);
    const price = toScaled(trade.price);
    const quantity = toScaled(trade.quantity);

    w.expire(now);
    w.add(
      { tradeId: trade.tradeId, timestamp: trade.timestamp, price, quantity, quote: mulScaled(price, quantity) },
      now,
    );

    return this.recompute(trade.symbol, now);
  }

  /** Current ticker for a symbol with the window expired to `now`. */
  current(symbol: string, now = Date.now()): TickerState {
    return this.recompute(symbol, now).ticker;
  }

  /** Expires old trades for every market; returns tickers whose values changed. */
  refresh(now = Date.now()): TickerState[] {
    const changed: TickerState[] = [];
    for (const symbol of this.windows.keys()) {
      const result = this.recompute(symbol, now);
      if (result.changed) changed.push(result.ticker);
    }
    return changed;
  }

  private recompute(symbol: string, now: number): { ticker: TickerState; changed: boolean } {
    const w = this.window(symbol);
    w.expire(now);

    const first = w.first();
    const { high, low } = w.extremes();
    const last = w.last;

    const values: TickerValues = {
      lastPrice: last ? formatScaled(last.price) : null,
      lastTradeTimestamp: last?.timestamp ?? null,
      open24h: null,
      high24h: null,
      low24h: null,
      priceChange24h: null,
      priceChangePercent24h: null,
      baseVolume24h: formatScaled(w.baseVolume),
      quoteVolume24h: formatScaled(w.quoteVolume),
      tradeCount24h: w.size,
      windowStart: now - TICKER_WINDOW_MS,
    };

    if (first && last && high !== null && low !== null) {
      const percent = percentChangeScaled(first.price, last.price);
      values.open24h = formatScaled(first.price);
      values.high24h = formatScaled(high);
      values.low24h = formatScaled(low);
      values.priceChange24h = formatScaled(last.price - first.price);
      values.priceChangePercent24h = percent === null ? null : formatScaled(percent);
    }

    return this.store.update(symbol, values);
  }

  clear(): void {
    this.windows.clear();
  }
}
