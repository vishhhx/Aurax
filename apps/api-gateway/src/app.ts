import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { ENV } from "./config/env";
import { errorMiddleware } from "./middleware/error";
import { rateLimit } from "./middleware/rateLimiter";
import { extractBearerToken, verifyToken } from "@repo/core/jwt";
import { authProxy, marketProxy, orderProxy, walletProxy } from "./proxy/proxy";

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: ENV.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    // Let browser clients back off on 429 without guessing.
    exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "Retry-After"],
  }),
);
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "live" } }));

/**
 * Development only: provisioned trading bots (apps/trading-bots, users
 * `*@bots.aurax.dev`) all share one IP and would exhaust the per-IP limits, so a
 * request carrying a VERIFIED bot access token skips them. Never in production.
 */
const isDevBot = (req: express.Request): boolean => {
  if (ENV.NODE_ENV === "production" || !ENV.JWT_ACCESS_SECRET) return false;
  const token = extractBearerToken(req);
  if (!token) return false;
  try {
    return verifyToken(token, ENV.JWT_ACCESS_SECRET).email?.endsWith("@bots.aurax.dev") ?? false;
  } catch {
    return false;
  }
};

const all = rateLimit({ limit: ENV.RATE_LIMIT_PER_MIN, name: "global", skip: isDevBot });
const writes = rateLimit({ limit: ENV.WRITE_RATE_LIMIT_PER_MIN, name: "writes", skip: isDevBot });
const writesOnly = (req: express.Request, res: express.Response, next: express.NextFunction) =>
  req.method === "GET" || req.method === "OPTIONS" ? next() : writes(req, res, next);

app.use(all);
app.use("/api/v1/auth/", authProxy);
app.use("/api/v1/wallet/", writesOnly, walletProxy);
app.use("/api/v1/order/", writesOnly, orderProxy);
app.use("/api/v1/market/", marketProxy);
app.use(errorMiddleware);

export default app;
