import { consumer as Consumer, TOPICS } from "@repo/kafka";

import { candleAggregator } from "../processors/candel";
import { tickerAggregator } from "../processors/tickers";
import { producerRouter } from "../producers/market";
import { tickerStore } from "../store/ticker";
import { recentTradesStore } from "../store/trades";
interface TradeExecutedEvent {
  event: "trade.executed";
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  timestamp: number;
  sequenceNumber?: string;
  side?: "BUY" | "SELL";
}

const consumer = Consumer(TOPICS.TRADE_EXECUTED);

export async function startTradeConsumer(): Promise<void> {
  await consumer.subscribe({
    topic: TOPICS.TRADE_EXECUTED,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString()) as TradeExecutedEvent;

      if (event.event !== "trade.executed") return;

      if (
        !event.symbol ||
        !event.tradeId ||
        !event.price ||
        !event.quantity ||
        !Number.isFinite(event.timestamp) ||
        event.timestamp < 0
      ) {
        throw new Error("Invalid trade.executed event");
      }

      if (
        event.sequenceNumber !== undefined &&
        !/^\d+$/.test(event.sequenceNumber)
      ) {
        throw new Error("Invalid trade sequence number");
      }

      tickerAggregator.processTrade(event);
      recentTradesStore.addTrade({
        tradeId: event.tradeId,
        symbol: event.symbol,
        price: event.price,
        quantity: event.quantity,
        timestamp: event.timestamp,
        side: event.side,
      });
      candleAggregator.processTrade(event);
      const ticker = tickerStore.getTicker(event.symbol);
      if (!ticker) {
        throw new Error(`Ticker was not initialized for ${event.symbol}`);
      }

      await producerRouter({
        event: "market.trade",
        symbol: event.symbol,
        tradeId: event.tradeId,
        price: event.price,
        quantity: event.quantity,
        timestamp: event.timestamp,
        side: event.side,
      });

      const marketTickerEvent = {
        event: "market.ticker" as const,
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        priceChange24h: ticker.priceChange24h,
        priceChangePercent24h: ticker.priceChangePercent24h,
        high24h: ticker.high24h,
        low24h: ticker.low24h,
        baseVolume24h: ticker.baseVolume24h,
        quoteVolume24h: ticker.quoteVolume24h,
        timestamp: Date.now(),
        sequenceNumber: String(ticker.sequenceNumber),
      };

      await producerRouter(marketTickerEvent);

      const dirtyCandles = candleAggregator.getDirtyCandles();

      for (const dirtyCandle of dirtyCandles) {
        const { candle } = dirtyCandle;

        await producerRouter({
          event: "market.candle",
          symbol: candle.symbol,
          interval: candle.interval,
          openTime: candle.openTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          baseVolume: candle.baseVolume,
          quoteVolume: candle.quoteVolume,
          isClosed: candle.isClosed,
          timestamp: candle.updatedAt,
        });
      }
    },
  });
}
