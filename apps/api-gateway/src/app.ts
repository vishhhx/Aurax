import express from "express";
import { authRouter } from "./router/auth";
import logger from "./config/logger";

const app = express();

app.use("/api/v1/auth/", authRouter);

export default app;
