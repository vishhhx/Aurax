export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "1d";

export interface TradeForCandle {
  event: "trade.executed";
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  timestamp: number;
  sequenceNumber?: string;
}

export interface Candle {
  symbol: string;
  interval: CandleInterval;
  openTime: number;
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

  firstTradeTimestamp: number;
  lastTradeTimestamp: number;

  firstTradeSequence: bigint;
  lastTradeSequence: bigint;

  updatedAt: number;
}

interface DirtyCandleEntry {
  revision: number;
  candle: InternalCandle;
}

const SCALE = 10n ** 18n;
const MAX_CANDLES_PER_INTERVAL = 500;
const MAX_SEEN_TRADES_PER_MARKET = 50_000;

export const CANDLE_INTERVALS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

function parseDecimal(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const [whole, fraction = ""] = value.split(".");

  if (fraction.length > 18) {
    throw new Error(`Decimal exceeds 18 places: ${value}`);
  }

  return BigInt(whole!) * SCALE + BigInt(fraction.padEnd(18, "0"));
}

function formatDecimal(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function getSequence(value?: string): bigint {
  if (value === undefined) return 0n;

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid trade sequence: ${value}`);
  }

  return BigInt(value);
}

function compareTradeOrder(
  timestampA: number,
  sequenceA: bigint,
  timestampB: number,
  sequenceB: bigint,
): number {
  if (timestampA < timestampB) return -1;
  if (timestampA > timestampB) return 1;

  if (sequenceA < sequenceB) return -1;
  if (sequenceA > sequenceB) return 1;

  return 0;
}

export class CandleAggregator {
  private readonly candles = new Map<
    string,
    Map<CandleInterval, Map<number, InternalCandle>>
  >();

  private readonly dirtyCandles = new Map<string, DirtyCandleEntry>();

  // Bounded deduplication cache, maintained separately per market.
  private readonly seenTrades = new Map<string, Map<string, true>>();

  private revision = 0;

  private getCandleKey(
    symbol: string,
    interval: CandleInterval,
    openTime: number,
  ): string {
    return `${symbol}:${interval}:${openTime}`;
  }

  private getIntervalCandles(
    symbol: string,
    interval: CandleInterval,
  ): Map<number, InternalCandle> {
    let market = this.candles.get(symbol);

    if (!market) {
      market = new Map();
      this.candles.set(symbol, market);
    }

    let intervalCandles = market.get(interval);

    if (!intervalCandles) {
      intervalCandles = new Map();
      market.set(interval, intervalCandles);
    }

    return intervalCandles;
  }

  private markDirty(candle: InternalCandle): void {
    const key = this.getCandleKey(
      candle.symbol,
      candle.interval,
      candle.openTime,
    );

    this.dirtyCandles.set(key, {
      revision: ++this.revision,
      candle: { ...candle },
    });
  }

  private rememberTrade(symbol: string, tradeId: string): boolean {
    let marketTrades = this.seenTrades.get(symbol);

    if (!marketTrades) {
      marketTrades = new Map();
      this.seenTrades.set(symbol, marketTrades);
    }

    if (marketTrades.has(tradeId)) {
      return false;
    }

    marketTrades.set(tradeId, true);

    // Evict the oldest cached ID when the cache reaches its limit.
    if (marketTrades.size > MAX_SEEN_TRADES_PER_MARKET) {
      const oldestId = marketTrades.keys().next().value;

      if (oldestId !== undefined) {
        marketTrades.delete(oldestId);
      }
    }

    return true;
  }

  public processTrade(trade: TradeForCandle): void {
    if (
      !trade.symbol ||
      !trade.tradeId ||
      !Number.isSafeInteger(trade.timestamp) ||
      trade.timestamp < 0
    ) {
      throw new Error("Invalid trade event");
    }

    const price = parseDecimal(trade.price);
    const quantity = parseDecimal(trade.quantity);
    const sequence = getSequence(trade.sequenceNumber);

    if (price <= 0n || quantity <= 0n) {
      throw new Error("Trade price and quantity must be positive");
    }

    // Reject duplicate trade IDs before modifying any candles.
    if (!this.rememberTrade(trade.symbol, trade.tradeId)) {
      return;
    }

    for (const interval of Object.keys(CANDLE_INTERVALS) as CandleInterval[]) {
      this.updateCandle(trade, interval, price, quantity, sequence);
    }
  }

  private updateCandle(
    trade: TradeForCandle,
    interval: CandleInterval,
    price: bigint,
    quantity: bigint,
    sequence: bigint,
  ): void {
    const duration = CANDLE_INTERVALS[interval];

    const openTime = Math.floor(trade.timestamp / duration) * duration;

    const intervalCandles = this.getIntervalCandles(trade.symbol, interval);

    const existing = intervalCandles.get(openTime);

    // Both price and quantity use SCALE, so divide their product by SCALE.
    const quoteQuantity = (price * quantity) / SCALE;

    let candle: InternalCandle;

    if (!existing) {
      candle = {
        symbol: trade.symbol,
        interval,
        openTime,

        open: price,
        high: price,
        low: price,
        close: price,

        baseVolume: quantity,
        quoteVolume: quoteQuantity,
        tradeCount: 1,

        firstTradeTimestamp: trade.timestamp,
        lastTradeTimestamp: trade.timestamp,

        firstTradeSequence: sequence,
        lastTradeSequence: sequence,

        updatedAt: trade.timestamp,
      };

      intervalCandles.set(openTime, candle);
    } else {
      candle = existing;

      if (price > candle.high) candle.high = price;
      if (price < candle.low) candle.low = price;

      candle.baseVolume += quantity;
      candle.quoteVolume += quoteQuantity;
      candle.tradeCount += 1;

      const firstComparison = compareTradeOrder(
        trade.timestamp,
        sequence,
        candle.firstTradeTimestamp,
        candle.firstTradeSequence,
      );

      if (firstComparison < 0) {
        candle.open = price;
        candle.firstTradeTimestamp = trade.timestamp;
        candle.firstTradeSequence = sequence;
      }

      const lastComparison = compareTradeOrder(
        trade.timestamp,
        sequence,
        candle.lastTradeTimestamp,
        candle.lastTradeSequence,
      );

      if (lastComparison > 0) {
        candle.close = price;
        candle.lastTradeTimestamp = trade.timestamp;
        candle.lastTradeSequence = sequence;
      }

      candle.updatedAt = Math.max(candle.updatedAt, trade.timestamp);
    }

    // Snapshot the latest candle revision for persistence.
    this.markDirty(candle);

    // Keep a bounded number of in-memory candles per interval.
    while (intervalCandles.size > MAX_CANDLES_PER_INTERVAL) {
      let oldestOpenTime = Infinity;

      for (const time of intervalCandles.keys()) {
        if (time < oldestOpenTime) {
          oldestOpenTime = time;
        }
      }

      if (oldestOpenTime === Infinity) break;

      // Do not delete its dirty entry. It may still need to be persisted.
      intervalCandles.delete(oldestOpenTime);
    }
  }

  private toPublicCandle(candle: InternalCandle, now: number): Candle {
    return {
      symbol: candle.symbol,
      interval: candle.interval,
      openTime: candle.openTime,

      open: formatDecimal(candle.open),
      high: formatDecimal(candle.high),
      low: formatDecimal(candle.low),
      close: formatDecimal(candle.close),

      baseVolume: formatDecimal(candle.baseVolume),
      quoteVolume: formatDecimal(candle.quoteVolume),

      tradeCount: candle.tradeCount,
      isClosed: now >= candle.openTime + CANDLE_INTERVALS[candle.interval],
      updatedAt: candle.updatedAt,
    };
  }

  public getCandles(
    symbol: string,
    interval: CandleInterval,
    limit = 100,
  ): Candle[] {
    if (
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > MAX_CANDLES_PER_INTERVAL
    ) {
      throw new Error("Invalid candle limit");
    }

    if (limit === 0) return [];

    const intervalCandles = this.candles.get(symbol)?.get(interval);

    if (!intervalCandles) return [];

    const now = Date.now();

    return Array.from(intervalCandles.values())
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-limit)
      .map((candle) => this.toPublicCandle(candle, now));
  }

  public getLatestCandle(
    symbol: string,
    interval: CandleInterval,
  ): Candle | undefined {
    return this.getCandles(symbol, interval, 1)[0];
  }

  /**
   * Returns immutable snapshots of pending candle revisions.
   * Calling this does not clear the dirty queue.
   */
  public getDirtyCandles(): DirtyCandle[] {
    const now = Date.now();

    return Array.from(this.dirtyCandles.entries(), ([key, entry]) => ({
      key,
      revision: entry.revision,
      candle: this.toPublicCandle(entry.candle, now),
    }));
  }

  /**
   * Acknowledge only the exact revisions successfully persisted.
   * Newer revisions remain dirty if a candle changed during the write.
   */
  public acknowledgePersisted(
    persisted: Array<{ key: string; revision: number }>,
  ): void {
    for (const item of persisted) {
      const current = this.dirtyCandles.get(item.key);

      if (current?.revision === item.revision) {
        this.dirtyCandles.delete(item.key);
      }
    }
  }

  public getDirtyCount(): number {
    return this.dirtyCandles.size;
  }

  public clear(): void {
    this.candles.clear();
    this.dirtyCandles.clear();
    this.seenTrades.clear();
  }
}

export const candleAggregator = new CandleAggregator();
