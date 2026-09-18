import crypto from "node:crypto";
import type { Request, Response } from "express";

import { ApiError, asyncHandler } from "@repo/core/rest";

import type { OrderInput } from "../schemas/order.schema";

import marketRepository from "../repositories/market.repositories";
import orderRepository from "../repositories/order.repositorie";

import walletClient from "../grpc/clients/wallet";
import { publishOrderCreatedEvent } from "../producer/order.producer";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const orderDetails: OrderInput = req.body;
  const referenceId = crypto.randomUUID();

  const market = await marketRepository.findBySymbol(orderDetails.symbol);

  if (!market) {
    throw new ApiError(400, "Market not found");
  }

  if (!market.isEnabled || market.status !== "TRADING") {
    throw new ApiError(400, "Market is not available for trading");
  }

  if (orderDetails.quantity <= 0) {
    throw new ApiError(400, "Quantity must be greater than zero");
  }

  if (
    orderDetails.quantity < Number(market.minQuantity) ||
    orderDetails.quantity > Number(market.maxQuantity)
  ) {
    throw new ApiError(
      400,
      `Quantity must be between ${market.minQuantity} and ${market.maxQuantity}`,
    );
  }

  if (orderDetails.orderType === "LIMIT") {
    if (orderDetails.price === undefined) {
      throw new ApiError(400, "Price is required for LIMIT orders");
    }

    if (orderDetails.price <= 0) {
      throw new ApiError(400, "Price must be greater than zero");
    }

    if (
      orderDetails.price < Number(market.minPrice) ||
      orderDetails.price > Number(market.maxPrice)
    ) {
      throw new ApiError(
        400,
        `Price must be between ${market.minPrice} and ${market.maxPrice}`,
      );
    }
  }

  let assetId: string;
  let amount: number;

  if (orderDetails.side === "SELL") {
    assetId = market.baseAssetId;
    amount = orderDetails.quantity;
  } else {
    assetId = market.quoteAssetId;

    if (orderDetails.orderType === "LIMIT") {
      amount = orderDetails.price! * orderDetails.quantity;
    } else {
      const estimatedPrice = await getEstimatedMarketPrice(orderDetails.symbol);

      amount = estimatedPrice * orderDetails.quantity;
    }
  }

  const notional =
    orderDetails.orderType === "LIMIT"
      ? orderDetails.price! * orderDetails.quantity
      : amount;

  if (notional < Number(market.minNotional)) {
    throw new ApiError(
      400,
      `Order value must be at least ${market.minNotional}`,
    );
  }

  const reserveBalanceResponse = await walletClient.reserveBalance(
    userId,
    assetId,
    amount.toString(),
    referenceId,
  );

  const order = await orderRepository.createOrder({
    orderType: orderDetails.orderType,
    side: orderDetails.side,
    price: orderDetails.price,
    quantity: orderDetails.quantity,
    symbol: orderDetails.symbol,
    userId,
    referenceId,
    marketId: market.marketId,
  });

  await publishOrderCreatedEvent(order);

  return res.status(201).json({
    success: true,
    data: {
      order,
      referenceId,
      reserveBalanceResponse,
    },
  });
});

const getEstimatedMarketPrice = async (symbol: string): Promise<number> => {
  console.log(`Getting estimated price for ${symbol}`);
  return 100;
};
