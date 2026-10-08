import { app } from "./app";
import { connectMongoDb } from "@repo/database";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { connectToredis } from "@repo/redis";
import { connectToPostgres } from "@repo/pg";
import { connectKafka } from "@repo/kafka";

import { initializeOrderBooks } from "./market/initialize";

const startServer = async () => {
  try {
    await connectMongoDb();
    logger.info("Connected to MongoDB");

    await connectToredis();
    logger.info("Connected to Redis");

    await connectToPostgres();
    logger.info("Connected to PostgreSQL");

    await connectKafka();
    logger.info("Connected to Kafka");

    await initializeOrderBooks(ENV.MARKETS);
    logger.info("Market order books initialized");
    const port = ENV.PORT;
    app.listen(port, () => {
      logger.info(`Market service is running on port ${port}`);
    });
  } catch (error) {
    logger.error(`Failed to start market service`);
    process.exit(1);
  }
};

startServer();
