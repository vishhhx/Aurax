import { BoundedSet } from "../lib/bounded-set";
import { formatScaled, mulScaled, toScaled } from "../lib/decimal";
import type { PublicTrade } from "../store/trades";
import type { CandleInterval } from "../types/events";

export type { CandleInterval } from "../types/events";

/**
 * Candle semantics
 * - `openTime = floor(timestamp / duration) * duration` (UTC, engine execution time).
 * - open/close are the first/last trade by (timestamp, tradeId); high/low/volumes are exact.
 * - A candle is closed once `now >= openTime + duration`. A late trade for an
 *   already-closed candle still revises it (a new dirty revision and a new
 *   `isClosed: true` publication); candles are only emitted for periods that
 *   had at least one trade.
 * - Each interval keeps the newest `maxCandlesPerInterval` candles in memory.
 *   Trades older than an evicted candle are ignored here (they are still
 *   stored in MarketTrade) so a partial candle can never overwrite the
 *   complete one already persisted.
 */
export const CANDLE_INTERVALS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export const INTERVALS = Object.keys(CANDLE_INTERVALS) as CandleInterval[];

export function isCandleInterval(value: unknown): value is CandleInterval {
  return typeof value === "string" && value in CANDLE_INTERVALS;
}

export interface Candle {
  symbol: string;
  interval: CandleInterval;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
  tradeCount: number;
  isClosed: boolean;
  updatedAt: number;
}

export interface DirtyCandle {
  key: string;
  revision: number;
  candle: Candle;
}

interface InternalCandle {
  symbol: string;
  interval: CandleInterval;
  openTime: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  baseVolume: bigint;
  quoteVolume: bigint;
  tradeCount: number;
  firstTrade: { timestamp: number; tradeId: string };
  lastTrade: { timestamp: number; tradeId: string };
  updatedAt: number;
  closePublished: boolean;
}

interface IntervalSeries {
  candles: Map<number, InternalCandle>;
  /** openTime of the newest candle evicted from memory, or -Infinity */
  evictedThrough: number;
}

export interface CandleAggregatorOptions {
  maxCandlesPerInterval?: number;
  maxSeenTradesPerMarket?: number;
}

function before(a: { timestamp: number; tradeId: string }, b: { timestamp: number; tradeId: string }) {
  return a.timestamp < b.timestamp || (a.timestamp === b.timestamp && a.tradeId < b.tradeId);
}

export class CandleAggregator {
  private readonly series = new Map<string, Map<CandleInterval, IntervalSeries>>();
  private readonly dirty = new Map<string, { revision: number; candle: Candle }>();
  private readonly seenTrades = new Map<string, BoundedSet<string>>();
  private revision = 0;

  readonly maxCandlesPerInterval: number;
  private readonly maxSeenTradesPerMarket: number;

  constructor(options: CandleAggregatorOptions = {}) {
    this.maxCandlesPerInterval = options.maxCandlesPerInterval ?? 1_000;
    this.maxSeenTradesPerMarket = options.maxSeenTradesPerMarket ?? 100_000;
  }

  static key(symbol: string, interval: CandleInterval, openTime: number): string {
    return `${symbol}:${interval}:${openTime}`;
  }

  private getSeries(symbol: string, interval: CandleInterval): IntervalSeries {
    let market = this.series.get(symbol);
    if (!market) {
      market = new Map();
      this.series.set(symbol, market);
    }
    let s = market.get(interval);
    if (!s) {
      s = { candles: new Map(), evictedThrough: -Infinity };
      market.set(interval, s);
    }
    return s;
  }

  private toPublic(candle: InternalCandle, now: number): Candle {
    const closeTime = candle.openTime + CANDLE_INTERVALS[candle.interval];
    return {
      symbol: candle.symbol,
      interval: candle.interval,
      openTime: candle.openTime,
      closeTime,
      open: formatScaled(candle.open),
      high: formatScaled(candle.high),
      low: formatScaled(candle.low),
      close: formatScaled(candle.close),
      baseVolume: formatScaled(candle.baseVolume),
      quoteVolume: formatScaled(candle.quoteVolume),
      tradeCount: candle.tradeCount,
      isClosed: now >= closeTime,
      updatedAt: candle.updatedAt,
    };
  }

  private markDirty(candle: InternalCandle, now: number): void {
    this.dirty.set(CandleAggregator.key(candle.symbol, candle.interval, candle.openTime), {
      revision: ++this.revision,
      candle: this.toPublic(candle, now),
    });
  }

  /**
   * Folds a trade into every interval. Returns the candles it changed, or an
   * empty array for duplicates. Throws on invalid decimals.
   */
  processTrade(trade: PublicTrade, now = Date.now()): Candle[] {
    const price = toScaled(trade.price);
    const quantity = toScaled(trade.quantity);

    if (price <= 0n || quantity <= 0n) {
      throw new Error("Trade price and quantity must be positive");
    }

    let seen = this.seenTrades.get(trade.symbol);
    if (!seen) {
      seen = new BoundedSet(this.maxSeenTradesPerMarket);
      this.seenTrades.set(trade.symbol, seen);
    }
    if (!seen.add(trade.tradeId)) return [];

    const quote = mulScaled(price, quantity);
    const touched: Candle[] = [];

    for (const interval of INTERVALS) {
      const candle = this.updateCandle(trade, interval, price, quantity, quote, now);
      if (candle) touched.push(this.toPublic(candle, now));
    }

    return touched;
  }

  private updateCandle(
    trade: PublicTrade,
    interval: CandleInterval,
    price: bigint,
    quantity: bigint,
    quote: bigint,
    now: number,
  ): InternalCandle | undefined {
    const duration = CANDLE_INTERVALS[interval];
    const openTime = Math.floor(trade.timestamp / duration) * duration;
    const s = this.getSeries(trade.symbol, interval);

    if (openTime <= s.evictedThrough) return undefined;

    const order = { timestamp: trade.timestamp, tradeId: trade.tradeId };
    let candle = s.candles.get(openTime);

    if (!candle) {
      candle = {
        symbol: trade.symbol,
        interval,
        openTime,
        open: price,
        high: price,
        low: price,
        close: price,
        baseVolume: quantity,
        quoteVolume: quote,
        tradeCount: 1,
        firstTrade: order,
        lastTrade: order,
        updatedAt: now,
        closePublished: false,
      };
      s.candles.set(openTime, candle);
    } else {
      if (price > candle.high) candle.high = price;
      if (price < candle.low) candle.low = price;
      candle.baseVolume += quantity;
      candle.quoteVolume += quote;
      candle.tradeCount += 1;
      if (before(order, candle.firstTrade)) {
        candle.open = price;
        candle.firstTrade = order;
      }
      if (before(candle.lastTrade, order)) {
        candle.close = price;
        candle.lastTrade = order;
      }
      candle.updatedAt = now;
      candle.closePublished = false;
    }

    this.markDirty(candle, now);
    this.evict(s);
    return s.candles.get(openTime);
  }

  private evict(s: IntervalSeries): void {
    while (s.candles.size > this.maxCandlesPerInterval) {
      let oldest = Infinity;
      for (const t of s.candles.keys()) if (t < oldest) oldest = t;
      if (oldest === Infinity) return;
      // Its dirty revision (if any) stays queued for persistence.
      s.candles.delete(oldest);
      s.evictedThrough = Math.max(s.evictedThrough, oldest);
    }
  }

  getCandles(
    symbol: string,
    interval: CandleInterval,
    options: { limit?: number; startTime?: number; endTime?: number } = {},
    now = Date.now(),
  ): Candle[] {
    const { limit = 100, startTime = -Infinity, endTime = Infinity } = options;
    const s = this.series.get(symbol)?.get(interval);
    if (!s || limit <= 0) return [];

    return Array.from(s.candles.values())
      .filter((c) => c.openTime >= startTime && c.openTime <= endTime)
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-limit)
      .map((c) => this.toPublic(c, now));
  }

  getCandle(symbol: string, interval: CandleInterval, openTime: number, now = Date.now()): Candle | undefined {
    const c = this.series.get(symbol)?.get(interval)?.candles.get(openTime);
    return c ? this.toPublic(c, now) : undefined;
  }

  /** Oldest openTime still held in memory for an interval (REST uses DB below it). */
  getOldestOpenTime(symbol: string, interval: CandleInterval): number | undefined {
    const s = this.series.get(symbol)?.get(interval);
    if (!s || s.candles.size === 0) return undefined;
    let oldest = Infinity;
    for (const t of s.candles.keys()) if (t < oldest) oldest = t;
    return oldest;
  }

  /**
   * Returns candles that have closed since the last call and have not yet been
   * published as closed, and marks them published.
   */
  collectNewlyClosed(now = Date.now()): Candle[] {
    const closed: Candle[] = [];
    for (const market of this.series.values()) {
      for (const s of market.values()) {
        for (const c of s.candles.values()) {
          if (!c.closePublished && now >= c.openTime + CANDLE_INTERVALS[c.interval]) {
            c.closePublished = true;
            closed.push(this.toPublic(c, now));
          }
        }
      }
    }
    return closed;
  }

  /** Re-queues candles for close publication (after a failed publish). */
  unmarkClosePublished(candles: Candle[]): void {
    for (const c of candles) {
      const internal = this.series.get(c.symbol)?.get(c.interval)?.candles.get(c.openTime);
      if (internal) internal.closePublished = false;
    }
  }

  /** Snapshot of pending revisions in insertion order, optionally capped. */
  getDirtyCandles(limit = Infinity): DirtyCandle[] {
    const out: DirtyCandle[] = [];
    for (const [key, entry] of this.dirty) {
      if (out.length >= limit) break;
      out.push({ key, revision: entry.revision, candle: entry.candle });
    }
    return out;
  }

  /** Clears only the exact revisions written; newer revisions stay dirty. */
  acknowledgePersisted(persisted: Array<{ key: string; revision: number }>): void {
    for (const item of persisted) {
      if (this.dirty.get(item.key)?.revision === item.revision) {
        this.dirty.delete(item.key);
      }
    }
  }

  getDirtyCount(): number {
    return this.dirty.size;
  }

  clear(): void {
    this.series.clear();
    this.dirty.clear();
    this.seenTrades.clear();
  }
}
