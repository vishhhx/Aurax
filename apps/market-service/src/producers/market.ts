import { TOPICS, producer } from "@repo/kafka";
import { CompressionTypes } from "kafkajs";

import type { MarketEvents } from "../types/events";

export const producerRouter = async (event: MarketEvents): Promise<void> => {
  switch (event.event) {
    case "market.ticker":
    case "market.depth":
    case "market.trade":
    case "market.candle":
      await producer.send({
        topic: TOPICS.MARKET_EVENTS,
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
      throw new Error(`Unsupported market event: ${_exhaustive}`);
    }
  }
};
