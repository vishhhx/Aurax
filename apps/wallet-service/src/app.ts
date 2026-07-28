import express from "express";
import { errorMiddleware } from "./middleware/error.middleware";
import { razorpayRouter } from "./routers/razorpay";
export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/payment/razorpay", razorpayRouter);
app.use(errorMiddleware);
