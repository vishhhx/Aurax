import { Router } from "express";
import { depositQuote, depositeinitialize, verifyPayments } from "../controller/deposit.controller";
export const razorpayRouter = Router();

razorpayRouter.get("/quote", depositQuote);
razorpayRouter.post("/init-deposit", depositeinitialize);

razorpayRouter.post("/verify", verifyPayments);

// The webhook is served unauthenticated with a raw body at /webhook/razorpay
// (see weebhook.router.ts); it cannot work behind JSON parsing and auth.
