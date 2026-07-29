import { consumer as Consumer, TOPICS } from "@repo/kafka";
import { handleDepositCompleted } from "../handlers/deposit.handler";

const topic = TOPICS.DEPOSIT_EVENTS;
export const consumeDeposit = async () => {
  const consumer = Consumer(topic);
  await consumer.subscribe({ topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message) return;

      const event = JSON.parse(message.value?.toString()!);

      switch (event.event) {
        case "deposit.completed":
          await handleDepositCompleted(event);
          break;

        default:
          break;
      }
    },
  });
};
