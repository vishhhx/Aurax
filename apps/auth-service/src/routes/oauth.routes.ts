import { Router } from "express";
import { initGoogleOauth2 } from "../controllers/oauth.controller";
export const oAuth2Router = Router();
oAuth2Router.get("/google", initGoogleOauth2);
