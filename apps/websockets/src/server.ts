import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import { ENV } from "./config/env";
import logger from "./config/logger";
import { attachGateway } from "./gateway";
import { createMarketHub, startMarketDataConsumer, stopMarketData } from "./market/market-data";
import { startUserEventConsumers, stopUserEventConsumers } from "./private/user-events";
import { metrics } from "./utils/metrics";

if (!ENV.JWT_ACCESS_SECRET) {
  logger.fatal("JWT_ACCESS_SECRET is required");
  process.exit(1);
}

const app = express();
app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "live", sockets: io.sockets.sockets.size, instance: ENV.INSTANCE_ID } });
});
app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(metrics.render());
});

const httpServer = createServer(app);
export const io = new Server(httpServer, {
  // Browsers connect with credentials (accessToken cookie) from the frontend origin.
  cors: { origin: ENV.CORS_ORIGINS, credentials: true },
  // Heartbeat: socket.io pings every 25s and drops clients silent for 20s.
  pingInterval: 25_000,
  pingTimeout: 20_000,
  maxHttpBufferSize: 64 * 1024,
});

createMarketHub(io);
attachGateway(io, { jwtSecret: ENV.JWT_ACCESS_SECRET });

async function startConsumers(): Promise<void> {
  await Promise.all([startMarketDataConsumer(), startUserEventConsumers(io)]);
}

httpServer.on("error", (error) => {
  logger.fatal({ err: error, port: ENV.PORT }, "WebSocket gateway failed to bind");
  process.exit(1);
});

httpServer.listen(ENV.PORT, () => {
  logger.info(`websocket server is running on port ${ENV.PORT} (instance ${ENV.INSTANCE_ID})`);
  startConsumers().catch((error) => {
    logger.error({ err: error }, "Failed to start Kafka consumers");
  });
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down websocket server");
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    // Consumers first (deleting this instance's groups), then sockets.
    await Promise.allSettled([stopMarketData(), stopUserEventConsumers()]);
    await new Promise<void>((resolve) => io.close(() => resolve()));
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
