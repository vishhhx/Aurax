import { app } from "./app";
import { connectMongoDb } from "@repo/database";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { connectToredis } from "@repo/redis";

const startServer = async () => {
  await connectMongoDb();
  logger.info("Connected to MongoDB");
  await connectToredis();
  logger.info("Connected to Redis");
  const port = ENV.PORT;
  app.listen(port, () => {
    logger.info(`Auth service is running on port ${port}`);
  });
};

startServer();
