import { ApiReponse, asyncHandler, ApiError } from "@repo/core/rest";
import type { Request, Response } from "express";
import { DepositService } from "../services/db";
import { RazorpayService } from "../services/razorpay";
export const depositeinitialize = asyncHandler(
  async (req: Request, res: Response) => {
    const { amount } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      throw new ApiError(401, "User not authenticated");
    }
    const usdcPriceInInr = 95.72;
    const usdcAmount = amount / usdcPriceInInr;

    const amountInPaise = amount * 100;

    const depositeService = new DepositService();
    const deposit = await depositeService.createDeposit({
      amount: usdcAmount,
      userId,
      assetId: "USDC",
    });

    const razopayService = new RazorpayService();
    const order = await razopayService.createOrder(
      amountInPaise,
      "INR",
      deposit.depositId,
    );

    await depositeService.updateOrderId(deposit.depositId, order.id);

    return res
      .status(200)
      .json(
        new ApiReponse(true, order, "Successfully initialized deposite", 200),
      );
  },
);

export const verifyPayments = asyncHandler(
  async (req: Request, res: Response) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const razorpayService = new RazorpayService();
    const depositeService = new DepositService();
    const isValid = razorpayService.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!isValid) {
      throw new ApiError(400, "Invalid payment signature");
    }
    await depositeService.conformPayment({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
    return res.status(200).json(
      new ApiReponse(
        true,
        {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          verified: true,
        },
        "Payment verified successfully",
        200,
      ),
    );
  },
);

export const RazorpayWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    console.log("Webhook reached");
    console.log(JSON.stringify(req.body));
    const signature = req.headers["x-razorpay-signature"] as string;

    if (!signature) {
      throw new ApiError(401, "Missing webhook signature");
    }

    const rawBody = req.body.toString("utf8");

    const razorpayService = new RazorpayService();

    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new ApiError(401, "Invalid webhook signature");
    }
    const body = JSON.parse(rawBody);

    switch (body.event) {
      case "payment.captured": {
        const payment = body.payload.payment.entity;

        const depositService = new DepositService();

        await depositService.completeDeposit({
          orderId: payment.order_id,
          paymentId: payment.id,
        });

        break;
      }

      default:
        console.log(body.event);
    }

    return res
      .status(200)
      .json(new ApiReponse(true, null, "Webhook processed", 200));
  },
);
