import type { Server } from "node:http";
import { CompressionTypes } from "kafkajs";
import { connectKafka, disconnectKafka, producer } from "@repo/kafka";
import { connectToPostgres, OutboxRelay, prisma } from "@repo/pg";

import { app } from "./app";
import { ENV } from "./config/env";
import logger from "./config/logger";
import { startGrpcServer } from "./grpc";

let server: Server | undefined;
let grpcServer: Awaited<ReturnType<typeof startGrpcServer>> | undefined;

const relay = new OutboxRelay({
  send: async (topic, messages) => {
    await producer.send({ topic, acks: -1, compression: CompressionTypes.GZIP, messages });
  },
  onError: (error) => logger.error({ err: error }, "Outbox relay failed; will retry"),
});

const startServer = async () => {
  await connectToPostgres();
  logger.info("Connected to PostgreSQL");
  await connectKafka();
  logger.info("Kafka producer connected");

  grpcServer = await startGrpcServer();
  if (ENV.OUTBOX_RELAY) relay.start();

  server = app.listen(ENV.PORT, () => logger.info(`Wallet service is running on port ${ENV.PORT}`));
};

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Shutting down wallet service");
  setTimeout(() => process.exit(1), 15_000).unref();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  await new Promise<void>((r) => (grpcServer ? grpcServer.tryShutdown(() => r()) : r()));
  if (ENV.OUTBOX_RELAY) await relay.stop();
  await disconnectKafka().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

startServer().catch((error) => {
  logger.fatal({ err: error }, "Wallet service failed to start");
  process.exit(1);
});
