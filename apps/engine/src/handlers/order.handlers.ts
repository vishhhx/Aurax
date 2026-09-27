import { type Order as OrderCreatedEvent } from "@repo/pg";

import { engine } from "../matching-engine";
import type { meta } from "../consumers/order.consumer";
import type { Order } from "../orderbook/order";

function toEngineOrder(event: OrderCreatedEvent): Order {
  return {
    id: event.orderId,
    userId: event.userId,
    symbol: event.symbol,
    side: event.side,
    type: event.orderType,
    timeInForce: event.timeInForce,
    price: event.price ? Number(event.price) : 0,
    quantity: Number(event.quantity),
    filledQuantity: Number(event.executedQuantity),
    remainingQuantity: Number(event.remainingQuantity),
    executedQuantity: Number(event.executedQuantity),
    postOnly: event.postOnly,
    timestamp: event.createdAt.getTime(),
    sequenceNumber: 0,
    fills: [],
  };
}

export const handleOrderCreated = async (
  event: OrderCreatedEvent,
  meta: meta,
): Promise<void> => {
  const engineOrder = toEngineOrder(event);

  await engine.consumeOrder(engineOrder, meta);
};
