import dotenv from "dotenv";
import { hostname } from "node:os";

dotenv.config();

const int = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 5005,
  /** Allowed browser origins (comma-separated). */
  CORS_ORIGINS: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,

  /**
   * Base URL of market-service (direct, not via the API gateway), used for
   * authoritative depth resync snapshots and the list of tradable symbols.
   * Optional: without it the gateway waits for the periodic Kafka snapshot.
   */
  MARKET_SERVICE_URL: process.env.MARKET_SERVICE_URL?.replace(/\/+$/, "") || undefined,

  /**
   * Unique per running instance. Every instance must receive every market and
   * user event (clients are connected to one instance), so each instance uses
   * its own Kafka consumer groups derived from this ID.
   */
  INSTANCE_ID: process.env.INSTANCE_ID || `${hostname()}-${process.pid}`,
  KAFKA_GROUP_PREFIX: process.env.KAFKA_GROUP_PREFIX || "websockets",

  MAX_SUBSCRIPTIONS_PER_SOCKET: int(process.env.MAX_SUBSCRIPTIONS_PER_SOCKET, 50),
  TICKER_COALESCE_MS: int(process.env.TICKER_COALESCE_MS, 250),
  SLOW_CLIENT_BUFFER_LIMIT: int(process.env.SLOW_CLIENT_BUFFER_LIMIT, 1_000),
};
