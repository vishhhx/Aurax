import { ApiReponse, asyncHandler, ApiError } from "@repo/core/rest";
import { Prisma } from "@repo/pg";
import type { Request, Response } from "express";

import { ENV } from "../config/env";
import logger from "../config/logger";
import { DepositService } from "../services/db";
import { RazorpayService } from "../services/razorpay";

const INR = /^\d+(\.\d{1,2})?$/;
const MIN_INR = new Prisma.Decimal(100);
const MAX_INR = new Prisma.Decimal(500_000);

/**
 * POST /payment/razorpay/init-deposit { amount: INR }
 * INR has 2 decimals (paise); the USDC credit is rounded DOWN to wallet
 * precision (8 dp) so a user is never credited more than they paid for.
 */
export function quoteInrDeposit(amount: unknown) {
  const raw = typeof amount === "number" ? String(amount) : amount;
  if (typeof raw !== "string" || !INR.test(raw)) {
    throw new ApiError(400, "amount must be an INR value with at most 2 decimals");
  }
  const inr = new Prisma.Decimal(raw);
  if (inr.lt(MIN_INR) || inr.gt(MAX_INR)) {
    throw new ApiError(400, `amount must be between ${MIN_INR.toFixed()} and ${MAX_INR.toFixed()} INR`);
  }
  const usdcAmount = inr.div(ENV.USDC_INR_RATE).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN);
  return { inr, usdcAmount };
}

/**
 * GET /payment/razorpay/quote?amount=<INR> — what init-deposit would credit,
 * computed exactly as init-deposit does, so the user sees it before paying.
 */
export const depositQuote = asyncHandler(async (req: Request, res: Response) => {
  const { inr, usdcAmount } = quoteInrDeposit(req.query.amount);
  return res.status(200).json(
    new ApiReponse(
      true,
      {
        amount: inr.toFixed(2),
        currency: "INR",
        asset: "USDC",
        creditAmount: usdcAmount.toFixed(),
        rate: new Prisma.Decimal(ENV.USDC_INR_RATE).toFixed(),
        minAmount: MIN_INR.toFixed(),
        maxAmount: MAX_INR.toFixed(),
      },
      "Deposit quote",
      200,
    ),
  );
});

export const depositeinitialize = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const { inr, usdcAmount } = quoteInrDeposit(req.body?.amount);
  const amountInPaise = inr.mul(100).toNumber(); // exact integer (≤ 2 dp input)

  const depositService = new DepositService();
  const deposit = await depositService.createDeposit({ amount: usdcAmount.toFixed(), userId, assetId: "USDC" });

  const order = await new RazorpayService().createOrder(amountInPaise, "INR", deposit.depositId);
  await depositService.updateOrderId(deposit.depositId, order.id);

  return res.status(200).json(new ApiReponse(true, order, "Successfully initialized deposit", 200));
});

/**
 * POST /payment/razorpay/verify — client-side confirmation after checkout.
 * Marks the deposit CONFIRMING; the balance is credited only by the
 * signed `payment.captured` webhook.
 */
export const verifyPayments = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === "string" && v.length > 0)) {
    throw new ApiError(400, "razorpay_order_id, razorpay_payment_id and razorpay_signature are required");
  }

  const isValid = new RazorpayService().verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!isValid) throw new ApiError(400, "Invalid payment signature");

  const { deposit } = await new DepositService().conformPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    userId,
  });
  if (!deposit) throw new ApiError(404, "Deposit not found");

  return res.status(200).json(
    new ApiReponse(
      true,
      { depositId: deposit.depositId, orderId: razorpay_order_id, paymentId: razorpay_payment_id, verified: true, status: deposit.status },
      deposit.status === "COMPLETED" ? "Deposit credited" : "Payment verified; awaiting confirmation",
      200,
    ),
  );
});

/** POST /webhook/razorpay (raw body) — the only path that credits a deposit. */
export const RazorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"];
  if (typeof signature !== "string" || !signature) throw new ApiError(401, "Missing webhook signature");
  if (!Buffer.isBuffer(req.body)) throw new ApiError(400, "Webhook body must be raw JSON");

  const rawBody = req.body.toString("utf8");
  if (!new RazorpayService().verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(401, "Invalid webhook signature");
  }

  const body = JSON.parse(rawBody);
  switch (body.event) {
    case "payment.captured": {
      const payment = body.payload?.payment?.entity;
      if (!payment?.order_id) throw new ApiError(400, "Missing payment order");
      const result = await new DepositService().completeDeposit({ orderId: payment.order_id, paymentId: payment.id });
      logger.info({ depositId: result.deposit.depositId, credited: result.credited }, "Razorpay payment captured");
      break;
    }
    default:
      logger.info({ event: body.event }, "Unhandled Razorpay webhook event");
  }

  return res.status(200).json(new ApiReponse(true, null, "Webhook processed", 200));
});
