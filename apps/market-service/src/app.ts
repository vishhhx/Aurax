import express from "express";
import cookieParser from "cookie-parser";

import { marketRouter } from "./routes/market";
import tradeRouter from "./routes/trades";

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/", marketRouter);
app.use("/markets", tradeRouter);
