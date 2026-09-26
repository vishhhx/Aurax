import { consumer as Consumer, TOPICS } from "@repo/kafka";
import { handleOrderCreated } from "../handlers/order.handlers";
const topic = TOPICS.ORDER_EVENTS;
export const consumeOrder = async (
  markets: string[]
) => {
  const consumer = Consumer(topic);
  await consumer.subscribe({
    topic,
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }
      try {
        const event = JSON.parse(
          message.value.toString()
        );
        if (
          !markets.includes(event.symbol)
        ) {
          return;
        }
        switch (event.event) {
          case "order.created":
            await handleOrderCreated(event);
            break;

          default:
            break;
        }
      } catch (error) {
        console.error(
          "Failed to process order event:",
          error
        );
      }
    },
  });
};