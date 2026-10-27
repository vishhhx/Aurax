import crypto from "node:crypto";
import type { Request, Response } from "express";

import { ApiError, ApiReponse, asyncHandler } from "@repo/core/rest";

import logger from "../config/logger";
import walletClient, { WalletRpcError } from "../grpc/clients/wallet";
import marketRepository from "../repositories/market.repositories";
import orderRepository, { CursorNotFoundError } from "../repositories/order.repositorie";
import { listOrdersSchema, listTradesSchema, type OrderInput } from "../schemas/order.schema";
import { reservationFor, validateOrder } from "../services/order-rules";

const RESERVATION_ERRORS: Record<string, [number, string]> = {
  INSUFFICIENT_BALANCE: [400, "Insufficient available balance"],
  WALLET_NOT_FOUND: [400, "No balance for this asset; deposit first"],
  DUPLICATE_REFERENCE: [409, "Duplicate order reference"],
};

/**
 * POST / — place an order.
 *
 * 1. Validate against the market's trading rules.
 * 2. Reserve funds in wallet-service (must succeed).
 * 3. Persist the order and its engine command atomically (outbox).
 * 4. If 3 fails, release the reservation so no funds stay locked.
 *
 * 202 Accepted: the engine processes the order asynchronously; its lifecycle
 * arrives via the private WebSocket channel and GET /:orderId.
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const input: OrderInput = req.body;

  const market = await marketRepository.findBySymbol(input.symbol);
  if (!market) throw new ApiError(404, `Market not found: ${input.symbol}`);

  validateOrder(market, input);
  const { assetId, amount } = reservationFor(market, input);
  const referenceId = crypto.randomUUID();

  try {
    await walletClient.reserveBalance(userId, assetId, amount.toFixed(), referenceId);
  } catch (error) {
    if (error instanceof WalletRpcError) {
      const [status, message] = RESERVATION_ERRORS[error.code] ?? [503, "Unable to reserve balance; try again"];
      throw new ApiError(status, message, [{ code: error.code }]);
    }
    throw error;
  }

  let order;
  try {
    order = await orderRepository.createOrderWithCommand({ input, userId, referenceId, marketId: market.marketId });
  } catch (error) {
    logger.error({ err: error, referenceId }, "Order persistence failed; releasing reservation");
    await walletClient.releaseBalance(referenceId).catch((releaseError) =>
      // Detected by the reservation reconciliation check (ACTIVE reservation without an order).
      logger.error({ err: releaseError, referenceId }, "Reservation release failed; requires reconciliation"),
    );
    throw new ApiError(500, "Order could not be placed; funds were not used");
  }

  return res.status(202).json(new ApiReponse(true, { order, reserved: { assetId, amount: amount.toFixed() } }, "Order accepted", 202));
});

/** DELETE /:orderId — request cancellation of the unfilled remainder. */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const outcome = await orderRepository.requestCancel(userId, String(req.params.orderId));

  if (outcome.result === "not_found") throw new ApiError(404, "Order not found");
  if (outcome.result === "not_active") {
    throw new ApiError(409, `Order is already ${outcome.order.status.toLowerCase()}`, [{ status: outcome.order.status }]);
  }
  return res.status(202).json(new ApiReponse(true, outcome.order, "Cancellation requested", 202));
});

/** GET /?status=open|closed|all&symbol&limit&before — the caller's orders, newest first. */
export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listOrdersSchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, "Invalid query", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { status, symbol, limit, before } = parsed.data;
  const orders = await withCursor(() =>
    orderRepository.listOrders(req.user!.userId, { status, symbol: normalizeSymbol(symbol), limit, before }),
  );
  return res.status(200).json(new ApiReponse(true, orders, "Orders fetched", 200));
});

/** GET /:orderId — one order with its fills. */
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await orderRepository.getOrder(req.user!.userId, String(req.params.orderId));
  if (!order) throw new ApiError(404, "Order not found");
  return res.status(200).json(new ApiReponse(true, order, "Order fetched", 200));
});

/** GET /trades?symbol&limit&before — the caller's fills, newest first. */
export const listTrades = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listTradesSchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, "Invalid query", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  const { symbol, limit, before } = parsed.data;
  const trades = await withCursor(() => orderRepository.listTrades(req.user!.userId, { symbol: normalizeSymbol(symbol), limit, before }));
  return res.status(200).json(new ApiReponse(true, trades, "Trades fetched", 200));
});

const normalizeSymbol = (symbol?: string) => symbol?.replace(/[-_/]/g, "").toUpperCase();

const withCursor = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CursorNotFoundError) throw new ApiError(400, error.message);
    throw error;
  }
};
