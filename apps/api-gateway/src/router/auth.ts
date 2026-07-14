import { Router } from "express";
import { authProxy } from "../proxy/proxy";
import logger from "../config/logger";
import { ENV } from "../config/env";

export const authRouter = Router();


authRouter.get("/oauth2/google", authProxy);
