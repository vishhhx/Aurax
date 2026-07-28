import { Router } from "express";

import { refreshTokenController } from "../controllers/session.controller";

export const sessionRouter = Router();

sessionRouter.post("/refresh", refreshTokenController);
