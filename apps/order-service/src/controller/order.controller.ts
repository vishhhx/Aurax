import { ApiError, asyncHandler } from "@repo/core/rest";
import type { Request, Response } from "express";
import type { OrderInput } from "../schemas/order.schema";
import { AssetService } from "../services/db";

import axios from "axios";
import { walletClient } from "../grpc/wallet.client";
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  //   const { userId } = req?.user;

  const referenceId = crypto.randomUUID();
  const orderDeatils: OrderInput = req.body;

  const assetService = new AssetService();

  const isAssetExist: boolean = await assetService.isAssetExist(
    orderDeatils.symbol,
  );

  if (!isAssetExist) {
    throw new ApiError(400, "Asset not found");
  }

  let fundsNeeded: number | null = null;

  if (orderDeatils.orderType === "LIMIT") {
    fundsNeeded = orderDeatils.price * orderDeatils.quantity;
  }

  const reserveBalanceResponse = await walletClient.ReserveBalance({
    userId: req.user?.userId,
    assetSymbol: orderDeatils.symbol,
    amount:
      orderDeatils.orderType === "LIMIT" ? fundsNeeded : orderDeatils.quantity,

    referenceId: referenceId,
  });

  axios;
});
