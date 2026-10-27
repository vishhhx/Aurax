import type { NextFunction, Request, Response } from "express";

/**
 * Fixed-window per-client limiter (in memory, per gateway instance).
 * Bounded: the window map is cleared every window. Behind a load balancer,
 * set `app.set("trust proxy", …)` so req.ip is the client address.
 */
export function rateLimit({
  limit,
  windowMs = 60_000,
  name,
  skip,
}: {
  limit: number;
  windowMs?: number;
  name: string;
  /** Requests for which this returns true are not counted or limited. */
  skip?: (req: Request) => boolean;
}) {
  let windowStart = Date.now();
  let counts = new Map<string, number>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) return next();
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      counts = new Map();
    }
    const key = req.ip ?? "unknown";
    const used = (counts.get(key) ?? 0) + 1;
    counts.set(key, used);

    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(limit - used, 0)));
    if (used > limit) {
      res.setHeader("Retry-After", String(Math.ceil((windowStart + windowMs - now) / 1000)));
      return res.status(429).json({ success: false, data: null, message: `Too many requests (${name})` });
    }
    next();
  };
}
