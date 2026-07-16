import { asyncHandler, ApiReponse } from "@repo/core/rest";
import { Request, Response } from "express";

import { GithubOauthService, googleOauthService } from "../services/oauth";
import { AuthService } from "../services/auth";
import { oAuthUser } from "../types/auth";
import { signToken } from "../utils/jwt";
import { UserPayload } from "../types/jwt";
import { ENV } from "../config/env";
import { HttpStatus } from "../utils/httpStatus";
import { IAuth } from "@repo/database";

function getQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return getQueryValue(value[0]);
  }

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

export const initGoogleOauth2 = asyncHandler(
  async (_req: Request, res: Response) => {
    const oauthService = new googleOauthService();
    const url: string = oauthService.generateGoogleAuthUrl();

    return res
      .status(HttpStatus.MOVED_PERMANENTLY)
      .json(
        new ApiReponse(
          true,
          url,
          "Successfully initialized Google OAuth2",
          HttpStatus.MOVED_PERMANENTLY,
        ),
      )
      .redirect(url);
  },
);

export const googleCallBack = asyncHandler(
  async (req: Request, res: Response) => {
    const code =
      getQueryValue(req.query.code) || getQueryValue(req.params.code);

    if (!code) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json(
          new ApiReponse(
            false,
            null,
            "Authorization code is required.",
            HttpStatus.BAD_REQUEST,
          ),
        );
    }

    const oauthService = new googleOauthService();
    const authService = new AuthService();

    const { user: googleUser } = await oauthService.googleCallback(code);

    let user: IAuth | null = await authService.checkUserExist(googleUser.email);

    if (!user) {
      user = await authService.register({
        email: googleUser.email,
        name: googleUser.name,
        provider: "google",
      });
    }

    const payload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };
    const accessToken = signToken(payload, ENV.JWT_ACCESS_SECRET!, "15m");
    const refreshToken = signToken(payload, ENV.JWT_REFRESH_SECRET!, "30d");
    user.refreshTokenHash = refreshToken;
    user.lastLogin = new Date();
    await user.save();
    const redirectUrl = `${ENV.FRONTEND_URL}/auth/success`;

    return res
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      })
      .redirect(HttpStatus.FOUND, redirectUrl);
  },
);

export const initGithubOauth2 = asyncHandler(
  async (_req: Request, res: Response) => {
    const oauthService = new GithubOauthService();
    const { url } = await oauthService.generateGithubAuthUrl();

    return res
      .status(HttpStatus.MOVED_PERMANENTLY)
      .json(
        new ApiReponse(
          true,
          url,
          "Successfully initialized GitHub OAuth2",
          HttpStatus.MOVED_PERMANENTLY,
        ),
      )
      .redirect(url);
  },
);

export const githubCallBack = asyncHandler(
  async (req: Request, res: Response) => {
    const code =
      getQueryValue(req.query.code) || getQueryValue(req.params.code);
    const state =
      getQueryValue(req.query.state) || getQueryValue(req.params.state);

    if (!code || !state) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json(
          new ApiReponse(
            false,
            null,
            "Authorization code and state are required.",
            HttpStatus.BAD_REQUEST,
          ),
        );
    }

    const oauthService = new GithubOauthService();
    const authService = new AuthService();

    const githubUser: oAuthUser = await oauthService.githubCallback(
      code,
      state,
    );

    let user: IAuth | null = await authService.checkUserExist(githubUser.email);

    if (!user) {
      user = await authService.register({
        email: githubUser.email,
        name: githubUser.name,
        provider: "github",
      });
    }

    const payload: UserPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };
    const accessToken = signToken(payload, ENV.JWT_ACCESS_SECRET!, "15m");
    const refreshToken = signToken(payload, ENV.JWT_REFRESH_SECRET!, "30d");
    user.refreshTokenHash = refreshToken;
    user.lastLogin = new Date();
    await user.save();
    const redirectUrl = `${ENV.FRONTEND_URL}/auth/success`;

    return res
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      })
      .redirect(HttpStatus.FOUND, redirectUrl);
  },
);
