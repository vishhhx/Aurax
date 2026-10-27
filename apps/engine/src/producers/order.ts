import { TOPICS, producer } from "@repo/kafka";
import { CompressionTypes } from "kafkajs";

import type { OrderEvents } from "../types/events";

/**
 * - Execution reports (trades and order lifecycle) → `trade.executed`, key =
 *   symbol: a single ordered stream per market for order-service settlement,
 *   market-service and the socket gateway.
 * - Book snapshots → `market.events`, key = symbol.
 */
export const producerRouter = async (event: OrderEvents): Promise<void> => {
  const topic = event.event === "orderbook.updated" ? TOPICS.MARKET_EVENTS : TOPICS.TRADE_EXECUTED;

  await producer.send({
    topic,
    compression: CompressionTypes.GZIP,
    acks: -1,
    messages: [
      {
        key: event.symbol,
        value: JSON.stringify(event),
        headers: { "event-type": event.event, ...("eventId" in event ? { "event-id": event.eventId } : {}) },
      },
    ],
  });
};
