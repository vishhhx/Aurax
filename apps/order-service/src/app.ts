import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middleware/error.middleware";
import { authenticate } from "./middleware/auth.middleware";
import { orderRouter } from "./routers/order.router";

export const app = express();
app.disable("x-powered-by");
app.get("/health", (_req, res) => res.json({ success: true, data: { status: "live" } }));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use(authenticate);
app.use("/", orderRouter);
app.use(errorMiddleware);
