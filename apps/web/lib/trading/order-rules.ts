import * as D from "@/lib/decimal"
import type { BookLevel, MarketInfo, OrderType, PlaceOrderRequest, Side, TimeInForce } from "@/lib/api/types"

/**
 * Client-side pre-trade checks, mirroring apps/order-service/src/services/order-rules.ts.
 * They exist to give immediate feedback; the server re-validates everything
 * and its answer is the one shown on submit.
 */

/** Wallet balances carry 8 fraction digits. */
export const WALLET_SCALE = 8

export interface OrderDraft {
  side: Side
  orderType: OrderType
  price: string
  quantity: string
  timeInForce: TimeInForce
  postOnly: boolean
}

export type DraftField = "price" | "quantity" | "form"

export interface DraftCheck {
  errors: Partial<Record<DraftField, string>>
  /** Body to POST when there are no errors */
  request: PlaceOrderRequest | null
  /** price × quantity for LIMIT orders */
  notional: string | null
  /** Highest fee the order can pay (the reservation includes it) */
  maxFee: string | null
  /** What the backend will lock: quote for BUY (incl. max fee), base for SELL */
  reservation: { asset: string; amount: string } | null
}

export function maxFeeRate(market: Pick<MarketInfo, "makerFee" | "takerFee">): string {
  return D.max(market.makerFee, market.takerFee)
}

export function canPlaceOrders(market: Pick<MarketInfo, "status">): boolean {
  return market.status === "TRADING"
}

function checkQuantity(market: MarketInfo, q: string): string | null {
  if (D.isZero(q)) return "Quantity must be greater than zero"
  if (D.fractionDigits(q) > market.quantityPrecision || !D.isMultipleOf(q, market.stepSize)) {
    return `Quantity must be a multiple of ${D.normalize(market.stepSize)}`
  }
  if (D.lt(q, market.minQuantity) || D.gt(q, market.maxQuantity)) {
    return `Quantity must be between ${D.normalize(market.minQuantity)} and ${D.normalize(market.maxQuantity)}`
  }
  return null
}

function checkPrice(market: MarketInfo, p: string): string | null {
  if (D.isZero(p)) return "Price must be greater than zero"
  if (D.fractionDigits(p) > market.pricePrecision || !D.isMultipleOf(p, market.tickSize)) {
    return `Price must be a multiple of ${D.normalize(market.tickSize)}`
  }
  if (D.lt(p, market.minPrice) || D.gt(p, market.maxPrice)) {
    return `Price must be between ${D.normalize(market.minPrice)} and ${D.normalize(market.maxPrice)}`
  }
  return null
}

/**
 * Validates a draft against the market rules and, when an available balance
 * is given, against it. Empty fields are reported only when `submitting`.
 */
export function checkDraft(market: MarketInfo, draft: OrderDraft, available: string | null, submitting = false): DraftCheck {
  const errors: DraftCheck["errors"] = {}
  const out: DraftCheck = { errors, request: null, notional: null, maxFee: null, reservation: null }
  const isLimit = draft.orderType === "LIMIT"

  if (!canPlaceOrders(market)) errors.form = `${market.baseAsset}/${market.quoteAsset} is ${market.status.replace("_", " ").toLowerCase()}; new orders are not accepted`
  if (draft.orderType === "MARKET" && draft.side === "BUY") {
    errors.form = "Market buy orders are not supported yet. Use a limit order."
  }
  if (draft.postOnly && (!isLimit || draft.timeInForce !== "GTC")) errors.form = "Post-only requires a GTC limit order"

  const quantity = D.normalizeInput(draft.quantity)
  const price = isLimit ? D.normalizeInput(draft.price) : null

  if (quantity === null) {
    if (draft.quantity.trim() !== "") errors.quantity = "Enter a valid number"
    else if (submitting) errors.quantity = "Enter a quantity"
  } else {
    const e = checkQuantity(market, quantity)
    if (e) errors.quantity = e
  }

  if (isLimit) {
    if (price === null) {
      if (draft.price.trim() !== "") errors.price = "Enter a valid number"
      else if (submitting) errors.price = "Enter a price"
    } else {
      const e = checkPrice(market, price)
      if (e) errors.price = e
    }
  }

  if (quantity !== null && !errors.quantity) {
    if (isLimit && price !== null && !errors.price) {
      out.notional = D.mul(price, quantity)
      out.maxFee = D.round(D.mul(out.notional, maxFeeRate(market)), WALLET_SCALE, "up")
      if (D.lt(out.notional, market.minNotional)) errors.quantity = `Order value must be at least ${D.normalize(market.minNotional)} ${market.quoteAsset}`
    }
    if (draft.side === "SELL") {
      out.reservation = { asset: market.baseAsset, amount: quantity }
    } else if (isLimit && price !== null && !errors.price) {
      // BUY reserves price × qty × (1 + max fee), rounded up to wallet precision.
      const gross = D.mul(D.mul(price, quantity), D.add("1", maxFeeRate(market)))
      out.reservation = { asset: market.quoteAsset, amount: D.round(gross, WALLET_SCALE, "up") }
    }
    if (out.reservation && available !== null && D.gt(out.reservation.amount, available) && !errors.quantity) {
      errors.form ??= `Insufficient ${out.reservation.asset} balance`
    }
  }

  if (Object.keys(errors).length === 0 && quantity !== null && (!isLimit || price !== null)) {
    out.request = {
      symbol: market.symbol,
      side: draft.side,
      orderType: draft.orderType,
      quantity,
      ...(isLimit ? { price: price!, timeInForce: draft.timeInForce, postOnly: draft.postOnly } : { timeInForce: "IOC" as const }),
    }
  }
  return out
}

/** Largest valid quantity for a fraction (0–1, as a decimal string) of the available balance. */
export function quantityForFraction(market: MarketInfo, side: Side, available: string, fraction: string, price: string | null): string | null {
  const budget = D.mul(available, fraction)
  let raw: string
  if (side === "SELL") {
    raw = budget
  } else {
    if (price === null || D.isZero(price)) return null
    const unitCost = D.mul(price, D.add("1", maxFeeRate(market)))
    raw = D.div(budget, unitCost, market.quantityPrecision + 2, "down")
  }
  const q = D.floorToStep(raw, market.stepSize)
  return D.isZero(q) ? null : D.round(q, market.quantityPrecision, "down")
}

export interface MarketFillEstimate {
  filled: string
  quote: string
  averagePrice: string | null
  /** The visible book cannot fill the whole quantity */
  partial: boolean
}

/**
 * Walks the visible levels to estimate a market order. It is an estimate of
 * the current book only; the engine fills against the book at execution time.
 */
export function estimateMarketFill(levels: BookLevel[], quantity: string, pricePrecision: number): MarketFillEstimate {
  let remaining = quantity
  let filled = "0"
  let quote = "0"
  for (const l of levels) {
    if (D.isZero(remaining)) break
    const take = D.min(remaining, l.quantity)
    filled = D.add(filled, take)
    quote = D.add(quote, D.mul(take, l.price))
    remaining = D.sub(remaining, take)
  }
  return {
    filled,
    quote,
    averagePrice: D.isZero(filled) ? null : D.div(quote, filled, pricePrecision, "half-up"),
    partial: D.gt(remaining, "0"),
  }
}
