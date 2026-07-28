import type { Request, Response } from "express";

import { asyncHandler, ApiReponse } from "@repo/core/rest";
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
    const refreshToken = extractBearerToken(req);

    if (!refreshToken) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json(
          new ApiReponse(
            false,
            null,
            "Refresh token is required.",
            HttpStatus.UNAUTHORIZED,
          ),
        );
    }

    const payload = verifyToken(
      refreshToken,
      ENV.JWT_REFRESH_SECRET!,
    ) as UserPayload;

    const storedToken = await getSessionToken(refreshToken);

    if (!storedToken) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json(
          new ApiReponse(
            false,
            null,
            "Invalid refresh token.",
            HttpStatus.UNAUTHORIZED,
          ),
        );
    }

    const authRepository = new AuthRepository();

    const user = await authRepository.findUserById(payload.userId);

    if (!user) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json(
          new ApiReponse(
            false,
            null,
            "User not found.",
            HttpStatus.UNAUTHORIZED,
          ),
        );
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
