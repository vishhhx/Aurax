import { asyncHandler, ApiReponse, ApiError } from "@repo/core/rest";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { GithubOauthService, googleOauthService } from "../services/oauth";
import { AuthService } from "../services/auth";
import { oAuthUser } from "../types/auth";
import { UserPayload } from "@repo/core/jwt";
import { ENV } from "../config/env";
import { HttpStatus } from "../utils/httpStatus";
import { IAuth } from "@repo/database";
import { issueAuthTokens, setAuthCookies } from "../utils/auth-tokens";
import logger from "../config/logger";
import { consumeOAuthState, issueOAuthState } from "../utils/oauth-state";

/**
 * The provider redirects the browser to the callback, so a failure must send
 * it back to the frontend (which shows `?error=auth_failed`), not render JSON.
 */
const oauthCallback =
  (handler: RequestHandler) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : error }, "OAuth callback failed");
      if (res.headersSent) return;
      res.redirect(HttpStatus.FOUND, `${ENV.FRONTEND_URL}/login?error=auth_failed`);
    }
  };

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
    const url: string = oauthService.generateGoogleAuthUrl(await issueOAuthState(res, "google"));

    return res

      .status(HttpStatus.OK)
      .json(
        new ApiReponse(
          true,
          url,
          "Successfully initialized Google OAuth2",
          HttpStatus.OK,
        ),
      );
  },
);

export const googleCallBack = oauthCallback(
  async (req: Request, res: Response) => {
    const code =
      getQueryValue(req.query.code) || getQueryValue(req.params.code);

    if (!code) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Authorization code is required.");
    }
    await consumeOAuthState(req, res, "google");

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
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    };

    const tokens = await issueAuthTokens(payload, { req });

    user.lastLogin = new Date();
    await user.save();

    const redirectUrl = `${ENV.FRONTEND_URL}/auth/success`;

    return setAuthCookies(res, tokens).redirect(HttpStatus.FOUND, redirectUrl);
  },
);

export const initGithubOauth2 = asyncHandler(
  async (_req: Request, res: Response) => {
    const oauthService = new GithubOauthService();
    const { url } = oauthService.generateGithubAuthUrl(await issueOAuthState(res, "github"));

    return res
      .status(HttpStatus.OK)
      .json(
        new ApiReponse(
          true,
          url,
          "Successfully initialized GitHub OAuth2",
          HttpStatus.OK,
        ),
      );
  },
);

export const githubCallBack = oauthCallback(
  async (req: Request, res: Response) => {
    const code =
      getQueryValue(req.query.code) || getQueryValue(req.params.code);

    if (!code) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Authorization code is required.");
    }
    await consumeOAuthState(req, res, "github");

    const oauthService = new GithubOauthService();
    const authService = new AuthService();

    const githubUser: oAuthUser = await oauthService.githubCallback(code);

    let user: IAuth | null = await authService.checkUserExist(githubUser.email);

    if (!user) {
      user = await authService.register({
        email: githubUser.email,
        name: githubUser.name,
        provider: "github",
      });
    }

    const payload: UserPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    };
    const tokens = await issueAuthTokens(payload, { req });
    user.lastLogin = new Date();
    await user.save();

    const redirectUrl = `${ENV.FRONTEND_URL}/auth/success`;

    return setAuthCookies(res, tokens).redirect(HttpStatus.FOUND, redirectUrl);
  },
);
