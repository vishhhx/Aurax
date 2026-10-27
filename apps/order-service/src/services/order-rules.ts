import { ApiError } from "@repo/core/rest";
import type { Prisma } from "@repo/pg";

import { dec, isMultipleOf, toWalletUp, WALLET_SCALE, type Decimal } from "../lib/money";
import type { OrderInput } from "../schemas/order.schema";

export interface MarketRules {
  marketId: string;
  symbol: string;
  baseAssetId: string;
  quoteAssetId: string;
  status: string;
  isEnabled: boolean;
  tickSize: Prisma.Decimal;
  stepSize: Prisma.Decimal;
  minPrice: Prisma.Decimal;
  maxPrice: Prisma.Decimal;
  minQuantity: Prisma.Decimal;
  maxQuantity: Prisma.Decimal;
  minNotional: Prisma.Decimal;
  makerFee: Prisma.Decimal;
  takerFee: Prisma.Decimal;
  pricePrecision: number;
  quantityPrecision: number;
}

const decimals = (v: string) => (v.includes(".") ? v.split(".")[1]!.length : 0);

/** Validates an order against the market's trading rules. Throws ApiError(400). */
export function validateOrder(market: MarketRules, input: OrderInput): void {
  if (!market.isEnabled || market.status !== "TRADING") {
    throw new ApiError(400, "Market is not available for trading");
  }

  if (input.orderType === "MARKET" && input.side === "BUY") {
    // The engine fills a market buy at whatever the book offers and cannot cap
    // the quote it spends, so no reservation can be guaranteed to cover it.
    throw new ApiError(400, "MARKET buy orders are not supported; place a LIMIT buy instead", [
      { field: "orderType", message: "MARKET_BUY_UNSUPPORTED" },
    ]);
  }

  const quantity = dec(input.quantity);
  if (decimals(input.quantity) > market.quantityPrecision || !isMultipleOf(quantity, market.stepSize)) {
    throw new ApiError(400, `Quantity must be a multiple of ${market.stepSize.toFixed()}`, [{ field: "quantity", message: "STEP_SIZE" }]);
  }
  if (quantity.lt(market.minQuantity) || quantity.gt(market.maxQuantity)) {
    throw new ApiError(400, `Quantity must be between ${market.minQuantity.toFixed()} and ${market.maxQuantity.toFixed()}`, [
      { field: "quantity", message: "QUANTITY_RANGE" },
    ]);
  }
  if (market.quantityPrecision > WALLET_SCALE) {
    throw new ApiError(500, "Market quantity precision exceeds wallet precision");
  }

  if (input.orderType === "LIMIT") {
    const price = dec(input.price!);
    if (decimals(input.price!) > market.pricePrecision || !isMultipleOf(price, market.tickSize)) {
      throw new ApiError(400, `Price must be a multiple of ${market.tickSize.toFixed()}`, [{ field: "price", message: "TICK_SIZE" }]);
    }
    if (price.lt(market.minPrice) || price.gt(market.maxPrice)) {
      throw new ApiError(400, `Price must be between ${market.minPrice.toFixed()} and ${market.maxPrice.toFixed()}`, [
        { field: "price", message: "PRICE_RANGE" },
      ]);
    }
    if (price.mul(quantity).lt(market.minNotional)) {
      throw new ApiError(400, `Order value must be at least ${market.minNotional.toFixed()}`, [{ field: "quantity", message: "MIN_NOTIONAL" }]);
    }
  }
}

/**
 * Funds locked for an order (settlement draws from this reservation):
 * - SELL: the base quantity.
 * - LIMIT BUY: limit price × quantity plus the higher of maker/taker fee
 *   (settlement charges the buyer's fee in the quote asset), rounded up to
 *   wallet precision. Fills at better prices and the unused fee margin are
 *   released when the order fills or is cancelled.
 */
export function reservationFor(market: MarketRules, input: OrderInput): { assetId: string; amount: Decimal } {
  const quantity = dec(input.quantity);
  if (input.side === "SELL") {
    return { assetId: market.baseAssetId, amount: quantity };
  }
  const feeRate = market.makerFee.gt(market.takerFee) ? market.makerFee : market.takerFee;
  const amount = toWalletUp(dec(input.price!).mul(quantity).mul(dec(1).add(feeRate)));
  return { assetId: market.quoteAssetId, amount };
}
