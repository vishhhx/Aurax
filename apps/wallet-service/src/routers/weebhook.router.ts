import express, { Router } from "express";
import { RazorpayWebhook } from "../controller/deposit.controller";
export const webhookRouter = Router();

webhookRouter.post(
  "/razorpay",
  express.raw({
    type: "application/json",
  }),
  RazorpayWebhook,
);
