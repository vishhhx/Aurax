import { tickerStore } from "../store/ticker";

export interface TradeExecutedEvent {
  event: "trade.executed";
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  timestamp: number;
}

interface StoredTrade {
  tradeId: string;
  price: bigint;
  quantity: bigint;
  timestamp: number;
  insertionOrder: number;
}

interface MarketTrades {
  trades: StoredTrade[];
  seenTradeIds: Map<string, number>;
  nextInsertionOrder: number;
}

const SCALE = 10n ** 18n;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function parseDecimal(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const [whole, fraction = ""] = value.split(".");

  if (fraction.length > 18) {
    throw new Error(`Decimal exceeds 18 places: ${value}`);
  }

  return BigInt(whole!) * SCALE + BigInt(fraction.padEnd(18, "0") || "0");
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

export class TickerAggregator {
  private readonly markets = new Map<string, MarketTrades>();

  private getMarket(symbol: string): MarketTrades {
    let market = this.markets.get(symbol);

    if (!market) {
      market = {
        trades: [],
        seenTradeIds: new Map(),
        nextInsertionOrder: 0,
      };

      this.markets.set(symbol, market);
    }

    return market;
  }

  private validateTrade(event: TradeExecutedEvent): {
    price: bigint;
    quantity: bigint;
  } {
    if (
      !event.symbol ||
      !event.tradeId ||
      !Number.isSafeInteger(event.timestamp) ||
      event.timestamp < 0
    ) {
      throw new Error("Invalid trade event");
    }

    const price = parseDecimal(event.price);
    const quantity = parseDecimal(event.quantity);

    if (price <= 0n || quantity <= 0n) {
      throw new Error("Trade price and quantity must be positive");
    }

    return { price, quantity };
  }

  /**
   * Process a live trade or a historical trade during reconstruction.
   */
  public processTrade(event: TradeExecutedEvent): void {
    const { price, quantity } = this.validateTrade(event);

    const market = this.getMarket(event.symbol);

    // Ignore duplicate Kafka deliveries.
    if (market.seenTradeIds.has(event.tradeId)) {
      return;
    }

    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Ignore trades outside the current 24-hour window.
    if (event.timestamp < cutoff) {
      return;
    }

    const trade: StoredTrade = {
      tradeId: event.tradeId,
      price,
      quantity,
      timestamp: event.timestamp,
      insertionOrder: market.nextInsertionOrder++,
    };

    market.trades.push(trade);
    market.seenTradeIds.set(event.tradeId, event.timestamp);

    // Remove expired trades and their deduplication entries.
    this.pruneExpiredTrades(event.symbol, now);

    // Keep chronological order, including out-of-order arrivals.
    market.trades.sort(
      (a, b) =>
        a.timestamp - b.timestamp || a.insertionOrder - b.insertionOrder,
    );

    this.recalculateTicker(event.symbol);
  }

  private pruneExpiredTrades(symbol: string, now: number): void {
    const market = this.getMarket(symbol);
    const cutoff = now - WINDOW_MS;

    market.trades = market.trades.filter((trade) => trade.timestamp >= cutoff);

    for (const [tradeId, timestamp] of market.seenTradeIds) {
      if (timestamp < cutoff) {
        market.seenTradeIds.delete(tradeId);
      }
    }
  }

  private recalculateTicker(symbol: string): void {
    const market = this.getMarket(symbol);
    const trades = market.trades;

    if (trades.length === 0) {
      tickerStore.updateTicker(symbol, {
        open24h: null,
        high24h: null,
        low24h: null,
        priceChange24h: null,
        priceChangePercent24h: null,
        baseVolume24h: "0",
        quoteVolume24h: "0",
      });

      return;
    }

    const first = trades[0]!;
    const last = trades[trades.length - 1]!;

    let high = first.price;
    let low = first.price;
    let baseVolume = 0n;
    let quoteVolume = 0n;

    for (const trade of trades) {
      if (trade.price > high) high = trade.price;
      if (trade.price < low) low = trade.price;

      baseVolume += trade.quantity;

      // Both price and quantity use 18-decimal fixed-point values.
      quoteVolume += (trade.price * trade.quantity) / SCALE;
    }

    const priceChange = last.price - first.price;

    const priceChangePercent =
      first.price === 0n ? null : (priceChange * 100n * SCALE) / first.price;

    tickerStore.updateTicker(symbol, {
      lastPrice: formatDecimal(last.price),
      lastTradeTimestamp: last.timestamp,

      open24h: formatDecimal(first.price),
      high24h: formatDecimal(high),
      low24h: formatDecimal(low),

      priceChange24h: formatDecimal(priceChange),
      priceChangePercent24h:
        priceChangePercent === null ? null : formatDecimal(priceChangePercent),

      baseVolume24h: formatDecimal(baseVolume),
      quoteVolume24h: formatDecimal(quoteVolume),
    });
  }

  /**
   * Rebuild one market's ticker from historical trades.
   *
   * Pass trades in chronological order when possible.
   * The method also sorts them internally.
   */
  public reconstructMarket(
    symbol: string,
    historicalTrades: TradeExecutedEvent[],
  ): void {
    this.markets.delete(symbol);

    const market = this.getMarket(symbol);
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Keep only trades belonging to this market and the current window.
    const trades = historicalTrades
      .filter(
        (trade) =>
          trade.symbol === symbol &&
          trade.timestamp >= cutoff &&
          trade.timestamp <= now,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const event of trades) {
      this.processTrade(event);
    }

    // Ensure a ticker exists even when no trades occurred in the window.
    if (trades.length === 0) {
      tickerStore.getOrCreateTicker(symbol);
      tickerStore.updateTicker(symbol, {
        lastPrice: null,
        lastTradeTimestamp: null,
        open24h: null,
        high24h: null,
        low24h: null,
        priceChange24h: null,
        priceChangePercent24h: null,
        baseVolume24h: "0",
        quoteVolume24h: "0",
      });
    }
  }

  /**
   * Rebuild multiple markets.
   */
  public reconstructMarkets(
    symbols: string[],
    historicalTrades: TradeExecutedEvent[],
  ): void {
    for (const symbol of symbols) {
      this.reconstructMarket(
        symbol,
        historicalTrades.filter((trade) => trade.symbol === symbol),
      );
    }
  }

  /**
   * Remove all in-memory ticker aggregation state.
   */
  public clear(): void {
    this.markets.clear();
  }

  /**
   * Remove one market's aggregation state.
   */
  public resetMarket(symbol: string): void {
    this.markets.delete(symbol);
  }
}

export const tickerAggregator = new TickerAggregator();
