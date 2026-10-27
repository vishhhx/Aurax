import { Router } from "express";

import { logoutController, refreshTokenController } from "../controllers/session.controller";

export const sessionRouter = Router();

sessionRouter.post("/refresh", refreshTokenController);
sessionRouter.post("/logout", logoutController);
