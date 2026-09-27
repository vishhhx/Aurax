import { TOPICS, producer } from "@repo/kafka";

import { CompressionTypes } from "kafkajs";

import type { OrderEvents } from "./events";

export const producerRouter = async (event: OrderEvents): Promise<void> => {
  switch (event.event) {
    case "order.completed":
      await producer.send({
        topic: TOPICS.ORDER_EVENTS,

        compression: CompressionTypes.GZIP,

        acks: -1,

        messages: [
          {
            key: event.orderId,

            value: JSON.stringify(event),
          },
        ],
      });

      return;

    case "order.rejected":
      await producer.send({
        topic: TOPICS.ORDER_EVENTS,

        compression: CompressionTypes.GZIP,

        acks: -1,

        messages: [
          {
            key: event.orderId,

            value: JSON.stringify(event),
          },
        ],
      });

      return;

    case "order.cancelled":
      await producer.send({
        topic: TOPICS.ORDER_EVENTS,

        compression: CompressionTypes.GZIP,

        acks: -1,

        messages: [
          {
            key: event.orderId,

            value: JSON.stringify(event),
          },
        ],
      });

      return;

    case "trade.executed":
      await producer.send({
        topic: TOPICS.TRADE_EXECUTED,

        compression: CompressionTypes.GZIP,

        acks: -1,

        messages: [
          {
            key: event.symbol,

            value: JSON.stringify(event),
          },
        ],
      });

      return;

    case "orderbook.updated":
      await producer.send({
        topic: TOPICS.TRADE_EXECUTED,

        compression: CompressionTypes.GZIP,

        acks: -1,

        messages: [
          {
            key: event.symbol,

            value: JSON.stringify(event),
          },
        ],
      });

      return;

    default: {
      const _exhaustive: never = event;

      throw new Error(`Unsupported event: ${_exhaustive}`);
    }
  }
};
