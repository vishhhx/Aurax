import { app } from "./app";
import { connectMongoDb } from "@repo/database";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { connectToredis } from "@repo/redis";
import { connectToPostgres, prisma } from "@repo/pg";
import { connectKafka } from "@repo/kafka";

import { initializeOrderBooks } from "./market/initialize";
import { startConsumers } from "./consumers";
import {
  startCandlePersistenceWorker,
  stopCandlePersistenceWorker,
} from "./workers/candel-percistence";

let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;

const startServer = async (): Promise<void> => {
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

    await startConsumers();
    logger.info("Market Service consumers started successfully");

    startCandlePersistenceWorker();
    logger.info("Candle persistence worker started");

    const port = ENV.PORT;

    server = app.listen(port, () => {
      logger.info(`Market service is running on port ${port}`);
    });
  } catch (error) {
    logger.error("Failed to start market service");
    process.exit(1);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Shutting down Market Service...`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await stopCandlePersistenceWorker();
    logger.info("Candle persistence worker stopped");

    await prisma.$disconnect();
    logger.info("PostgreSQL disconnected");

    process.exit(0);
  } catch (error) {
    logger.error("Error during Market Service shutdown");
    process.exit(1);
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void startServer();
