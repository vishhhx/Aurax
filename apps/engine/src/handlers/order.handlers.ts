import { engine } from "../matching-engine";
import type { KafkaMessageMeta } from "../types/kafka";
import type { Order, OrderCancelRequestedEvent } from "../types/order";

/**
 * `order.created` command (topic `order.events`, key = symbol), published by
 * order-service via its outbox after the order and its reservation committed.
 * Decimals are strings; `createdAt` is ISO-8601 (JSON has no Date type —
 * reading it as a Date previously crashed the engine on every order).
 */
export interface OrderCreatedCommand {
  event: "order.created";
  eventId: string;
  orderId: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET";
  timeInForce: "GTC" | "IOC" | "FOK";
  price: string | null;
  quantity: string;
  postOnly: boolean;
  createdAt: string;
}

const DECIMAL = /^\d+(\.\d+)?$/;

/** Returns a reason string when the command is malformed, otherwise null. */
export function validateOrderCreated(e: Partial<OrderCreatedCommand>): string | null {
  if (!e.orderId || !e.userId || !e.symbol) return "missing identifiers";
  if (e.side !== "BUY" && e.side !== "SELL") return "invalid side";
  if (e.orderType !== "LIMIT" && e.orderType !== "MARKET") return "invalid order type";
  if (!["GTC", "IOC", "FOK"].includes(String(e.timeInForce ?? "GTC"))) return "invalid time in force";
  if (typeof e.quantity !== "string" || !DECIMAL.test(e.quantity) || Number(e.quantity) <= 0) return "invalid quantity";
  if (e.orderType === "LIMIT" && (typeof e.price !== "string" || !DECIMAL.test(e.price) || Number(e.price) <= 0)) {
    return "invalid price";
  }
  if (e.createdAt !== undefined && Number.isNaN(Date.parse(String(e.createdAt)))) return "invalid createdAt";
  return null;
}

export function toEngineOrder(event: OrderCreatedCommand): Order {
  const quantity = Number(event.quantity);
  return {
    id: event.orderId,
    userId: event.userId,
    symbol: event.symbol,
    side: event.side,
    type: event.orderType,
    timeInForce: event.timeInForce ?? "GTC",
    price: event.price ? Number(event.price) : 0,
    quantity,
    filledQuantity: 0,
    remainingQuantity: quantity,
    executedQuantity: 0,
    postOnly: Boolean(event.postOnly),
    timestamp: event.createdAt ? Date.parse(event.createdAt) : Date.now(),
    sequenceNumber: 0,
    fills: [],
  };
}

export const handleOrderCreated = async (event: OrderCreatedCommand, meta: KafkaMessageMeta): Promise<void> => {
  const reason = validateOrderCreated(event);
  if (reason) {
    if (event.orderId && event.userId && event.symbol && engine.hasMarket(event.symbol)) {
      // Malformed but attributable: reject so order-service releases the reservation.
      await engine.consumeOrder({ ...toEngineOrder({ ...event, quantity: "0", price: null }), remainingQuantity: 0 }, meta);
    } else {
      console.error(`[Engine] Dropping malformed order.created at ${meta.partition}:${meta.offset}: ${reason}`);
    }
    return;
  }
  await engine.consumeOrder(toEngineOrder(event), meta);
};

export const handleOrderCancelRequested = async (
  event: OrderCancelRequestedEvent,
  meta: KafkaMessageMeta,
): Promise<void> => {
  if (!event.orderId || !event.userId || !event.symbol) {
    console.error(`[Engine] Dropping malformed order.cancel_requested at ${meta.partition}:${meta.offset}`);
    return;
  }
  await engine.cancelOrder(event, meta);
};
