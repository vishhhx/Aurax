import express from "express";
import { errorMiddleware } from "./middleware/error.middleware";
import { razorpayRouter } from "./routers/razorpay";
import { webhookRouter } from "./routers/weebhook.router";
import { walletRouter } from "./routers/wallet.routes";
import { authenticate } from "./middleware/auth.middleware";
import cookieParser from "cookie-parser";
export const app = express();
app.use("/webhook", webhookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(authenticate);
app.use("/payment/razorpay", razorpayRouter);
app.use("/", walletRouter);
app.use(errorMiddleware);
