import { Router } from "express";
import {
  initGoogleOauth2,
  googleCallBack,
  initGithubOauth2,
  githubCallBack,
} from "../controllers/oauth.controller";

export const oAuth2Router = Router();
oAuth2Router.get("/google", initGoogleOauth2);
oAuth2Router.get("/google/callback", googleCallBack);
oAuth2Router.get("/github", initGithubOauth2);
oAuth2Router.get("/github/callback", githubCallBack);
