import { app } from "./app";
import { connectMongoDb } from "@repo/database";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { connectToredis } from "@repo/redis";
import { connectToPostgres } from "@repo/pg";

import { connectKafka } from "@repo/kafka";
const startServer = async () => {
  await connectMongoDb();
  logger.info("Connected to MongoDB");
  await connectToredis();
  logger.info("Connected to Redis");
  await connectToPostgres();
  logger.info("connected to postgres");
  await connectKafka();
  logger.info("connected to kafka");
  const port = ENV.PORT;
  app.listen(port, () => {
    logger.info(`Order service is running on port ${port}`);
  });
};

startServer();
