import app from "./app";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { connectToredis } from "@repo/redis";

const startServer = async () => {
  await connectToredis();
  logger.info("Connected to Redis");
  const port = ENV.PORT;
  app.listen(port, () => {
    logger.info(`Api-Gateway  is running on port ${port}`);
  });
};

startServer();
