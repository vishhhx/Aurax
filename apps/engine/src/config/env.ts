const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const ENV = {
  /** Market shards, one cluster worker each. */
  MARKETS_A: list(process.env.MARKETS_A),
  MARKETS_B: list(process.env.MARKETS_B),

  /**
   * Each worker serves gRPC on ENGINE_GRPC_HOST:(ENGINE_GRPC_BASE_PORT + worker index):
   * worker 0 (MARKETS_A) on the base port, worker 1 (MARKETS_B) on base + 1.
   * Consumers route by symbol (see market-service ORDER_GRPC_URL).
   */
  ENGINE_GRPC_HOST: process.env.ENGINE_GRPC_HOST || "0.0.0.0",
  ENGINE_GRPC_BASE_PORT: Number(process.env.ENGINE_GRPC_BASE_PORT || 8003),

  KAFKA_GROUP_PREFIX: process.env.KAFKA_GROUP_PREFIX || "engine",

  /** "s3" (default when a bucket is configured) or "fs" (local directory). */
  SNAPSHOT_STORE: (process.env.SNAPSHOT_STORE || (process.env.S3_BUCKET_NAME ? "s3" : "fs")) as "s3" | "fs",
  SNAPSHOT_DIR: process.env.SNAPSHOT_DIR || ".snapshots",
  /** Snapshot every N commands per market (LIVE mode). */
  SNAPSHOT_EVERY: Number(process.env.SNAPSHOT_EVERY || 100),

  S3_REGION: process.env.S3_REGION || "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "",
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || "",
};
