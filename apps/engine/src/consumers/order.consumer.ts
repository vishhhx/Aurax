import { consumer as Consumer, TOPICS } from "@repo/kafka";
import { handleOrderCreated } from "../handlers/order.handlers";
const topic = TOPICS.ORDER_EVENTS;

export interface meta {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}
export const consumeOrder = async (markets: string[]) => {
  const consumer = Consumer(topic);
  await consumer.subscribe({
    topic,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message, topic, partition }) => {
      if (!message.value) {
        return;
      }

      const meta: meta = {
        topic,
        partition,
        offset: message.offset,
        timestamp: message.timestamp,
      };
      try {
        const event = JSON.parse(message.value.toString());
        if (!markets.includes(event.symbol)) {
          return;
        }
        switch (event.event) {
          case "order.created":
            await handleOrderCreated(event, meta);
            break;

          default:
            break;
        }
      } catch (error) {
        console.error("Failed to process order event:", error);
      }
    },
  });
};
