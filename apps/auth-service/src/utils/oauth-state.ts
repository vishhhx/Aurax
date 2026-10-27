import type { Request, Response } from "express";
import { ApiError } from "@repo/core/rest";
import { RedisString } from "@repo/redis";
import { ENV } from "../config/env";

const STATE_TTL_SECONDS = 300;
const COOKIE = "oauthState";

const cookieOptions = () => ({
  httpOnly: true,
  secure: ENV.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/**
 * Anti-CSRF `state` for the OAuth redirect. It is stored in Redis (single use,
 * 5 min) AND in an HttpOnly cookie, so a callback is only accepted in the
 * browser that started the flow: a callback link crafted by someone else
 * carries their state, which does not match this browser's cookie.
 */
export async function issueOAuthState(res: Response, provider: "google" | "github"): Promise<string> {
  const state = crypto.randomUUID();
  await new RedisString().set(`oauth:${provider}:${state}`, "1", { EX: STATE_TTL_SECONDS });
  res.cookie(COOKIE, state, { ...cookieOptions(), maxAge: STATE_TTL_SECONDS * 1000 });
  return state;
}

export async function consumeOAuthState(req: Request, res: Response, provider: "google" | "github"): Promise<void> {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const expected = req.cookies?.[COOKIE];
  res.clearCookie(COOKIE, cookieOptions());

  if (!state || typeof expected !== "string" || state !== expected) {
    throw new ApiError(400, "OAuth state mismatch.");
  }
  // Single use, atomically: only one callback can delete the key.
  const deleted = await new RedisString().delete(`oauth:${provider}:${state}`);
  if (deleted !== 1) throw new ApiError(400, "Invalid or expired OAuth state.");
}
