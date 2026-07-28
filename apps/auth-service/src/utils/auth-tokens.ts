import type { Request, Response } from "express";
import { signToken, type UserPayload } from "@repo/core/jwt";
import { ENV } from "../config/env";
import { deleteSessionToken, generateSessionToken } from "../services/sessions";
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface IssueAuthTokensOptions {
  req?: Request;
  refreshTokenToReplace?: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  expiresAt?: Date;
}

export const generateAuthTokens = (payload: UserPayload): AuthTokens => ({
  accessToken: signToken(payload, ENV.JWT_ACCESS_SECRET!, "15m"),
  refreshToken: signToken(payload, ENV.JWT_REFRESH_SECRET!, "30d"),
});

export const issueAuthTokens = async (
  payload: UserPayload,
  options: IssueAuthTokensOptions = {},
): Promise<AuthTokens> => {
  const tokens = generateAuthTokens(payload);

  if (options.refreshTokenToReplace) {
    await deleteSessionToken(options.refreshTokenToReplace);
  }

  await generateSessionToken({
    refreshToken: tokens.refreshToken,
    deviceId: options.deviceId ?? crypto.randomUUID(),
    ip: options.ip ?? options.req?.ip ?? "",
    userAgent: options.userAgent ?? options.req?.get("User-Agent") ?? "Unknown",
    createdAt: new Date(),
    expiresAt: options.expiresAt ?? new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return tokens;
};

export const setAuthCookies = (res: Response, tokens: AuthTokens): Response =>
  res
    .cookie("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure: ENV.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })
    .cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: ENV.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
