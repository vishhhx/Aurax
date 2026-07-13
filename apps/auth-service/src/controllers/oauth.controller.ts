import { asyncHandler, ApiReponse } from "@repo/core/rest";
import { Request, Response } from "express";

import { OauthServices } from "../services/oauth";

export const initGoogleOauth2 = asyncHandler(
  async (req: Request, res: Response) => {
    const authService = new OauthServices();

    const url: string = authService.initGoogleAuth();

    res
      .status(301)
      .json(new ApiReponse(true, url, "succsefully initedGoogle Oauth2", 301))
      .redirect(url);
  },
);
