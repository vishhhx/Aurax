import { z } from "zod";

const csv = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5004),

  PG_DATABASE_URL: z.string().min(1, "PG_DATABASE_URL is required"),
  // Read by @repo/grpc; validated here so a missing value fails fast.
  ORDER_GRPC_URL: z.string().min(1, "ORDER_GRPC_URL is required"),

  /** Markets this instance serves. Must also exist (and be enabled) in Postgres. */
  MARKETS: csv.pipe(z.array(z.string().regex(/^[A-Z0-9]{2,20}$/)).min(1, "MARKETS must list at least one symbol")),

  KAFKA_GROUP_PREFIX: z.string().min(1).default("market-service"),
  /** Replays the retained trade.executed log when the consumer group is new. Safe: trades are deduplicated in Postgres. */
  KAFKA_TRADES_FROM_BEGINNING: bool.default(true),

  GRPC_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  ENGINE_READY_TIMEOUT_MS: z.coerce.number().int().min(0).default(0),

  // Must not exceed the REST depth limit (500): gateways resync via REST with limit = depth.
  DEPTH_PUBLISH_LEVELS: z.coerce.number().int().min(1).max(500).default(50),
  DEPTH_SNAPSHOT_INTERVAL_MS: z.coerce.number().int().min(1_000).default(30_000),
  RECENT_TRADES_PER_MARKET: z.coerce.number().int().min(1).max(1_000).default(100),
  CANDLE_PERSIST_INTERVAL_MS: z.coerce.number().int().min(250).default(5_000),
  /** Trades older than this when consumed are applied to state but not re-broadcast (historical replay). */
  REPLAY_PUBLISH_MAX_AGE_MS: z.coerce.number().int().min(0).default(60_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid market-service configuration:\n${issues}`);
  }

  return result.data;
}

export const ENV: Env = parseEnv(process.env);
