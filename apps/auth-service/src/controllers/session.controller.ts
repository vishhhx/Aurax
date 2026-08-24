import type { Request, Response } from "express";

import { asyncHandler, ApiReponse, ApiError } from "@repo/core/rest";
import {
  extractBearerToken,
  type UserPayload,
  verifyToken,
} from "@repo/core/jwt";

import { ENV } from "../config/env";
import { HttpStatus } from "../utils/httpStatus";
import { getSessionToken } from "../services/sessions";
import { AuthRepository } from "../repositories/auth.repositories";
import { issueAuthTokens, setAuthCookies } from "../utils/auth-tokens";

export const refreshTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    // Prefer an explicitly supplied bearer token for non-browser clients;
    // browsers send the HttpOnly refresh-token cookie automatically.
    const refreshToken = extractBearerToken(req) ?? req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Refresh token is required.");
    }

    let payload: UserPayload;
    try {
      payload = verifyToken(refreshToken, ENV.JWT_REFRESH_SECRET!);
    } catch {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token.");
    }

    const storedToken = await getSessionToken(refreshToken);

    if (!storedToken) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid refresh token.");
    }

    const authRepository = new AuthRepository();

    const user = await authRepository.findUserById(payload.userId);

    if (!user) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "User not found.");
    }

    const jwtPayload: UserPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
    };

    const tokens = await issueAuthTokens(jwtPayload, {
      req,
      refreshTokenToReplace: refreshToken,
    });

    return setAuthCookies(res.status(HttpStatus.OK), tokens).json(
      new ApiReponse(
        true,
        {
          accessToken: tokens.accessToken,
        },
        "Token refreshed successfully.",
        HttpStatus.OK,
      ),
    );
  },
);
