import { consumer as Consumer, TOPICS } from "@repo/kafka";

import { tickerStore } from "../store/ticker";
import { recentTradesStore } from "../store/trades";
import { tickerAggregator } from "../processors/tickers";
import { candleAggregator } from "../processors/candel";
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

      // Next:
      // Publish market.trade and market.ticker.
    },
  });
}
