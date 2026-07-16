import { asyncHandler, ApiReponse } from "@repo/core/rest";
import { Request, Response } from "express";

import { GithubOauthService, googleOauthService } from "../services/oauth";
import { url } from "zod";
import { AuthService } from "../services/auth";
import { GoogleOAuthResponse } from "../types/auth";

export const initGoogleOauth2 = asyncHandler(
  async (req: Request, res: Response) => {
    const authService = new googleOauthService();

    const url: string = authService.generateGoogleAuthUrl();

    res
      .status(301)
      .json(new ApiReponse(true, url, "succsefully initedGoogle Oauth2", 301))
      .redirect(url);
  },
);

export const googleCallBack = asyncHandler(
  async (req: Request, res: Response) => {
    const oAuthService = new googleOauthService();
    const { code } = req.params;
    if (!code) {
      res.status(400).json(new ApiReponse(false, null, "", 400));
    }

    const resposne: GoogleOAuthResponse = await oAuthService.googleCallback(
      code as string,
    );

    const authService = new AuthService();

    const user =await authService.checkUserExist(resposne.user.email);
    if(user){
        
    }
  },
);
