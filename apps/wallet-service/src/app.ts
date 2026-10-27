import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middleware/error.middleware";
import { razorpayRouter } from "./routers/razorpay";
import { webhookRouter } from "./routers/weebhook.router";
import { walletRouter } from "./routers/wallet.routes";
import { authenticate } from "./middleware/auth.middleware";

export const app = express();
app.disable("x-powered-by");
app.get("/health", (_req, res) => res.json({ success: true, data: { status: "live" } }));
// Signed by Razorpay, unauthenticated, raw body: must precede JSON parsing and auth.
app.use("/webhook", webhookRouter);
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.use(authenticate);
app.use("/payment/razorpay", razorpayRouter);
app.use("/", walletRouter);
app.use(errorMiddleware);
