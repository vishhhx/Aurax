import type { Server } from "node:http";
import type { Consumer } from "kafkajs";
import { connectKafka, disconnectKafka } from "@repo/kafka";
import { connectToPostgres, prisma } from "@repo/pg";

import { ENV } from "./config/env";
import logger from "./config/logger";
import { app } from "./app";
import { health } from "./health";
import { startConsumers } from "./consumers";
import { matchingEngine } from "./grpc/orderbook";
import { waitForEngineReady } from "./market/initialize";
import { reconstructMarketState } from "./market/reconstruct";
import { marketRegistry } from "./market/registry";
import { candleAggregator, orderBookStore, recentTradesStore, tickerAggregator } from "./market/state";
import { OrderBookSync } from "./processors/orderbook-sync";
import { TradePipeline } from "./processors/trade-pipeline";
import { marketPublisher } from "./producers/market";
import { upsertCandles } from "./repositories/candles";
import { tradeRepo } from "./repositories/trades";
import { CandlePersistenceWorker } from "./workers/candle-persistence";
import { MarketTimers } from "./workers/market-timers";

let server: Server | undefined;
let consumers: Consumer[] = [];
let kafkaConnected = false;
let shuttingDown = false;
const startupAbort = new AbortController();

const isServed = (symbol: string) => marketRegistry.has(symbol);

const pipeline = new TradePipeline({
  repo: tradeRepo,
  publisher: marketPublisher,
  ticker: tickerAggregator,
  candles: candleAggregator,
  recent: recentTradesStore,
  isServed,
  replayPublishMaxAgeMs: ENV.REPLAY_PUBLISH_MAX_AGE_MS,
});

const orderBookSync = new OrderBookSync({
  store: orderBookStore,
  fetchSnapshot: (symbol) => matchingEngine.getOrderBook(symbol),
  publisher: marketPublisher,
  depthLevels: ENV.DEPTH_PUBLISH_LEVELS,
  isServed,
});

const candleWorker = new CandlePersistenceWorker(candleAggregator, upsertCandles, ENV.CANDLE_PERSIST_INTERVAL_MS);
const timers = new MarketTimers({
  ticker: tickerAggregator,
  candles: candleAggregator,
  publisher: marketPublisher,
  registry: marketRegistry,
  orderBookSync,
  depthSnapshotIntervalMs: ENV.DEPTH_SNAPSHOT_INTERVAL_MS,
});

/**
 * Startup order:
 *  1. Postgres (market registry, MarketTrade, candles)
 *  2. Market registry = MARKETS ∩ enabled markets
 *  3. Kafka producer
 *  4. HTTP server (liveness only; data routes return 503 until ready)
 *  5. Matching engine LIVE → order books from gRPC
 *  6. Ticker / candle / recent-trade state rebuilt from MarketTrade
 *  7. Kafka consumers, then persistence worker and timers → ready
 */
async function start(): Promise<void> {
  await connectToPostgres();
  logger.info("Connected to PostgreSQL");

  const symbols = await marketRegistry.load(ENV.MARKETS);
  logger.info({ symbols }, "Market registry loaded");

  await connectKafka();
  kafkaConnected = true;
  logger.info("Kafka producer connected");

  server = app.listen(ENV.PORT, () => logger.info(`Market service listening on port ${ENV.PORT}`));

  await waitForEngineReady(ENV.ENGINE_READY_TIMEOUT_MS, startupAbort.signal);
  await orderBookSync.initialize(symbols);

  await reconstructMarketState({
    symbols,
    pipeline,
    ticker: tickerAggregator,
    stream: (s, since) => tradeRepo.streamSince(s, since),
    latest: (s) => tradeRepo.latestPerSymbol(s),
  });
  // Rebuilt historical candles were already published (or predate this
  // service); don't re-broadcast them as "newly closed".
  candleAggregator.collectNewlyClosed();

  consumers = await startConsumers({ pipeline, orderBookSync });

  candleWorker.start();
  timers.start();

  health.setPhase("ready");
  logger.info("Market service is ready");
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  health.setPhase("stopping");
  startupAbort.abort();
  logger.info({ signal }, "Shutting down market service");

  const force = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, ENV.SHUTDOWN_TIMEOUT_MS);
  force.unref();

  const step = async (name: string, fn: () => Promise<unknown> | unknown) => {
    try {
      await fn();
      logger.info(`${name} stopped`);
    } catch (error) {
      exitCode = 1;
      logger.error({ err: error }, `${name} failed to stop cleanly`);
    }
  };

  await step("HTTP server", () =>
    server ? new Promise<void>((resolve, reject) => server!.close((e) => (e ? reject(e) : resolve()))) : undefined,
  );
  // Stop consuming first so no new state changes race the final flush.
  await step("Kafka consumers", () => Promise.all(consumers.map((c) => c.disconnect())));
  timers.stop();
  await step("Candle persistence (final flush)", () => candleWorker.stop());
  await step("Kafka producer", () => (kafkaConnected ? disconnectKafka() : undefined));
  await step("gRPC client", () => matchingEngine.close());
  await step("PostgreSQL", () => prisma.$disconnect());

  clearTimeout(force);
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

start().catch((error) => {
  if (shuttingDown) return;
  logger.fatal({ err: error }, "Market service failed to start");
  health.setError(error instanceof Error ? error.message : String(error));
  void shutdown("startup-failure", 1);
});
