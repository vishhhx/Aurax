import { kafka, TOPICS } from "@repo/kafka";
import logger from "../utils/logger";

async function createTopics() {
  const admin = kafka.admin();
  logger.info("Creating topics...");
  try {
    await admin.createTopics({
      topics: [
        { topic: TOPICS.DEPOSIT_EVENTS },
        { topic: TOPICS.WITHDRAWAL_EVENTS },
        { topic: TOPICS.ORDER_EVENTS },
        { topic: TOPICS.TRADE_EXECUTED },
        { topic: TOPICS.NOTIFICATION_EVENTS },
        { topic: TOPICS.MARKET_EVENTS },
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
