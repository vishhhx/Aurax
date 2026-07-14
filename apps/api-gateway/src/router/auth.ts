import { Router } from "express";
import { authProxy } from "../proxy/proxy";

export const authRouter = Router();

authRouter.get("/oauth2/google/callback", authProxy);
