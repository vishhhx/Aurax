import express from "express";
import logger from "./config/logger";

import { authProxy, walletProxy } from "./proxy/proxy";
import { errorMiddleware } from "./middleware/error";
import cors from "cors";
import cookieParser from "cookie-parser";
const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(cookieParser());

app.use("/api/v1/auth/", authProxy);
app.use("/api/v1/wallet/", walletProxy);

app.use(errorMiddleware);

export default app;
