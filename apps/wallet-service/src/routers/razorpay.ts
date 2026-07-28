import { Router } from "express";
import {
  depositeinitialize,
  verifyPayments,
  RazorpayWebhook,
} from "../controller/deposit.controller";
export const razorpayRouter = Router();

razorpayRouter.post("/init-deposit", depositeinitialize);

razorpayRouter.post("/verify", verifyPayments);

razorpayRouter.post("/webhook", RazorpayWebhook);
