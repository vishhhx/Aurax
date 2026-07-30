import { Router } from "express";
import { getUserDetails } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

export const authRouter = Router();

authRouter.get("/details", authenticate, getUserDetails);
authRouter.get("/user-details", authenticate, getUserDetails);
