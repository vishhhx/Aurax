import { kafka } from "@repo/kafka";
import logger from "../utils/logger";

async function createTopics() {
  const admin = kafka.admin();
  logger.info("Creating topics...");
  try {
    await admin.createTopics({
      topics: [
        { topic: "deposit.events" },
        { topic: "withdrawal.events" },
        { topic: "order.created" },
        { topic: "trade.executed" },
        { topic: "notification.events" },
      ],
    });
    logger.info("Topics created successfully.");
  } catch (error: any) {
    logger.error("Error creating topics:", error);
  } finally {
    await admin.disconnect();
    logger.info("Admin disconnected.");
  }
}

await createTopics();
