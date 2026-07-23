import { ApiReponse, asyncHandler } from "@repo/core/rest";
import type { Request, Response } from "express";
import { DepositService } from "../services/db";
import { RazorpayService } from "../services/razorpay";
export const depositeinitialize = asyncHandler(
  async (req: Request, res: Response) => {
    const { amount } = req.body;
    const { userId } = req.user;
    const amountInPaise = amount * 100; // Convert amount to paise
    const depositeService = new DepositService();
    const deposit = await depositeService.createDeposit({
      amount: amountInPaise,
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
