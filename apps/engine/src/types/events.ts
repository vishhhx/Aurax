import type { OrderSide, OrderStatus } from "@repo/pg";

/**
 * Execution reports published by the engine on the `trade.executed` topic,
 * key = symbol (one ordered stream per market). Every event carries a
 * deterministic `eventId`, so a replay after recovery produces identical IDs
 * and consumers can deduplicate.
 *
 * Quantities/prices are decimal strings formatted to the market's precision.
 */

interface Base {
  eventId: string;
  symbol: string;
  timestamp: number;
}

/** The order is resting on the book (after any immediate partial match). */
export interface OrderOpenedEvent extends Base {
  event: "order.opened";
  orderId: string;
  userId: string;
  side: OrderSide;
  price: string;
  executedQuantity: string;
  remainingQuantity: string;
}

export interface OrderRejectedEvent extends Base {
  event: "order.rejected";
  userId: string;
  orderId: string;
  reason: string;
}

/** The unfilled remainder is cancelled; executedQuantity stays filled. */
export interface OrderCancelledEvent extends Base {
  event: "order.cancelled";
  userId: string;
  orderId: string;
  reason: "USER_CANCELLED" | "IOC_REMAINING_QUANTITY" | "MARKET_NO_LIQUIDITY";
  executedQuantity: string;
  remainingQuantity: string;
}

/** A cancel request that could not be applied (order not open on the book). */
export interface OrderCancelRejectedEvent extends Base {
  event: "order.cancel_rejected";
  userId: string;
  orderId: string;
  reason: "NOT_OPEN" | "NOT_OWNER";
}

interface TradeParty {
  orderId: string;
  userId: string;
  /** Status after this fill: PARTIALLY_FILLED or FILLED */
  status: OrderStatus;
  side: OrderSide;
  executedQuantity: string;
  remainingQuantity: string;
}

export interface TradeExecutedEvent extends Base {
  event: "trade.executed";
  /** Deterministic: `<takerOrderId>-f<n>` (n-th fill of the taker) */
  tradeId: string;
  marketId: string;
  maker: TradeParty;
  taker: TradeParty;
  price: string;
  quantity: string;
}

/** Full book snapshot for market-service (topic `market.events`). */
export interface OrderBookUpdatedEvent {
  event: "orderbook.updated";
  symbol: string;
  sequenceNumber: string;
  bids: { price: string; quantity: string }[];
  asks: { price: string; quantity: string }[];
  timestamp: number;
}

export type ExecutionReport =
  | OrderOpenedEvent
  | OrderRejectedEvent
  | OrderCancelledEvent
  | OrderCancelRejectedEvent
  | TradeExecutedEvent;

export type OrderEvents = ExecutionReport | OrderBookUpdatedEvent;
