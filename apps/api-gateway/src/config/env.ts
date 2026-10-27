import dotenv from "dotenv";

dotenv.config();

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`api-gateway: ${name} is required`);
  return value;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 5000,
  AUTH_SERVICE_URL: required("AUTH_SERVICE_URL"),
  WALLET_SERVICE_URL: required("WALLET_SERVICE_URL"),
  ORDER_SERVICE_URL: required("ORDER_SERVICE_URL"),
  MARKET_SERVICE_URL: required("MARKET_SERVICE_URL"),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((o) => o.trim()).filter(Boolean),
  UPSTREAM_TIMEOUT_MS: Number(process.env.UPSTREAM_TIMEOUT_MS) || 10_000,
  /** Optional: services verify tokens themselves; used only by middleware/auth.ts if mounted. */
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  /** Requests per IP per minute; stricter budget for order/wallet writes. */
  RATE_LIMIT_PER_MIN: Number(process.env.RATE_LIMIT_PER_MIN) || 600,
  WRITE_RATE_LIMIT_PER_MIN: Number(process.env.WRITE_RATE_LIMIT_PER_MIN) || 120,
};
