import type { CandleEvent, DepthEvent, DepthLevel, TickerEvent, TradeEvent } from "../src/market/protocol";

export const L = (price: string, quantity: string): DepthLevel => ({ price, quantity });

export function depthSnapshot(seq: number, bids: DepthLevel[] = [L("99", "1")], asks: DepthLevel[] = [L("101", "1")], symbol = "BTCUSDC"): DepthEvent {
  return {
    eventId: `depth:${symbol}:snapshot:${seq}`,
    type: "depth.updated",
    schemaVersion: 2,
    symbol,
    sequenceNumber: String(seq),
    timestamp: 1_000 + seq,
    data: { kind: "snapshot", depth: 10, bids, asks },
  };
}

export function depthDelta(prev: number, seq: number, bids: DepthLevel[] = [], asks: DepthLevel[] = [], symbol = "BTCUSDC"): DepthEvent {
  return {
    eventId: `depth:${symbol}:delta:${prev}:${seq}`,
    type: "depth.updated",
    schemaVersion: 2,
    symbol,
    sequenceNumber: String(seq),
    timestamp: 1_000 + seq,
    data: { kind: "delta", depth: 10, prevSequenceNumber: String(prev), bids, asks },
  };
}

export function tradeEvent(tradeId: string, symbol = "BTCUSDC"): TradeEvent {
  return {
    eventId: `trades:${symbol}:${tradeId}`,
    type: "trades.updated",
    schemaVersion: 2,
    symbol,
    sequenceNumber: null,
    timestamp: 5_000,
    data: { tradeId, price: "100", quantity: "1", quoteQuantity: "100", side: "BUY", isBuyerMaker: false, executedAt: 4_999 },
  };
}

export function tickerEvent(seq: number, timestamp: number, symbol = "BTCUSDC", lastPrice = "100"): TickerEvent {
  return {
    eventId: `ticker:${symbol}:boot:${seq}`,
    type: "ticker.updated",
    schemaVersion: 2,
    symbol,
    sequenceNumber: String(seq),
    timestamp,
    data: {
      lastPrice,
      openPrice24h: "90",
      priceChange24h: "10",
      priceChangePercent24h: "11.11",
      high24h: "101",
      low24h: "89",
      baseVolume24h: "5",
      quoteVolume24h: "500",
      tradeCount24h: 5,
      lastTradeTimestamp: timestamp,
      windowStart: timestamp - 86_400_000,
    },
  };
}

export function candleEvent(openTime: number, tradeCount: number, symbol = "BTCUSDC", interval: CandleEvent["data"]["interval"] = "1m"): CandleEvent {
  return {
    eventId: `candles:${symbol}:${interval}:${openTime}:${tradeCount}:o`,
    type: "candles.updated",
    schemaVersion: 2,
    symbol,
    sequenceNumber: String(tradeCount),
    timestamp: openTime + 1,
    data: {
      interval,
      openTime,
      closeTime: openTime + 60_000,
      open: "1",
      high: "2",
      low: "1",
      close: "2",
      baseVolume: "1",
      quoteVolume: "1",
      tradeCount,
      isClosed: false,
    },
  };
}
