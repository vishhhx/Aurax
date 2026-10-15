import { consumer as Consumer, TOPICS } from "@repo/kafka";

import { marketOrderBookStore } from "../store/orderbook";
import type { PriceLevel } from "../types/orderbook";

interface OrderBookUpdatedEvent {
  event: "orderbook.updated";
  symbol: string;
  sequenceNumber: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: number;
}

const consumer = Consumer(TOPICS.MARKET_EVENTS);

export async function startOrderBookConsumer(): Promise<void> {
  await consumer.subscribe({
    topic: TOPICS.MARKET_EVENTS,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const event = JSON.parse(
        message.value.toString(),
      ) as OrderBookUpdatedEvent;

      if (event.event !== "orderbook.updated") return;

      const sequenceNumber = Number(event.sequenceNumber);

      if (!Number.isSafeInteger(sequenceNumber)) {
        throw new Error(`Invalid sequence number for ${event.symbol}`);
      }

      const snapshot = {
        symbol: event.symbol,
        sequenceNumber,
        bids: event.bids,
        asks: event.asks,
      };

      const existing = marketOrderBookStore.get(event.symbol);

      if (!existing) {
        marketOrderBookStore.initialize(snapshot);
        return;
      }

      const applied = marketOrderBookStore.update(snapshot);

      if (!applied) {
        return;
      }

      // The in-memory order book now reflects the latest snapshot.
      // Publish market.depth here if required.
    },
  });
}
