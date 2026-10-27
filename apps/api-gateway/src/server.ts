import app from "./app";
import { ENV } from "./config/env";
import logger from "./config/logger";

const server = app.listen(ENV.PORT, () => {
  logger.info(`Api-Gateway is running on port ${ENV.PORT}`);
});

server.on("error", (error) => {
  logger.fatal({ err: error, port: ENV.PORT }, "API gateway failed to bind");
  process.exit(1);
});

process.once("SIGTERM", () => server.close(() => process.exit(0)));
process.once("SIGINT", () => server.close(() => process.exit(0)));
