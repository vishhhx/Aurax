import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 5000,
  JWT_SECRET: process.env.JWT_SECRET!,
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL!,
  REDIS_URL: process.env.REDIS_URL!,
  WALLET_SERVICE_URL: process.env.WALLET_SERVICE_URL!,
};
