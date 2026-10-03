import { consumer as Consumer, TOPICS } from "@repo/kafka";
import { handleOrderCompleted } from "./handlers/order.handlers";
import { handleTradeExecuted } from "./handlers/trade.handlers";
import type { OrderSide, OrderStatus } from "@repo/pg";
const topic = TOPICS.ORDER_EVENTS;
export const consumeOrder = async (markets: string[]) => {
  const consumer = Consumer(topic);

  await consumer.subscribe({
    topic,
    fromBeginning: true,
  });

  await consumer.run({
    eachMessage: async ({ message, topic, partition }) => {
      if (!message.value) return;

      try {
        const event = JSON.parse(message.value.toString());

        if (!markets.includes(event.symbol)) {
          return;
        }

        switch (event.event) {
          case "trade.executed":
            await handleTradeExecuted(event);
            break;

          case "order.completed":
            await handleOrderCompleted(event);
            break;

          // case "order.cancelled":
          //   await handleOrderCancelled(event);
          //   break;

          // case "order.rejected":
          //   await handleOrderRejected(event);
          //   break;

          default:
            break;
        }
      } catch (error) {
        console.error("Failed to process order event:", error);

        throw error;
      }
    },
  });
};

export interface OrderCompletedEvent {
  event: "order.completed";

  userId: string;
  orderId: string;
  symbol: string;

  status: "FILLED" | "PARTIALLY_FILLED";
}

export interface OrderRejectedEvent {
  event: "order.rejected";

  userId: string;
  orderId: string;
  symbol: string;

  reason: string;
}

export interface OrderCancelledEvent {
  event: "order.cancelled";

  userId: string;
  orderId: string;
  symbol: string;

  reason: string;
}

export interface TradeExecutedEvent {
  event: "trade.executed";

  tradeId: string;

  symbol: string;

  marketId: string;

  maker: {
    orderId: string;
    userId: string;
    status: OrderStatus;
    side: OrderSide;
  };

  taker: {
    orderId: string;
    userId: string;
    status: OrderStatus;
    side: OrderSide;
  };

  price: string;
  quantity: string;

  timestamp: number;
}

export interface OrderBookUpdatedEvent {
  event: "orderbook.updated";

  symbol: string;

  sequenceNumber: string;

  bids: {
    price: string;
    quantity: string;
  }[];

  asks: {
    price: string;
    quantity: string;
  }[];

  timestamp: number;
}

export type OrderEvents =
  | OrderCompletedEvent
  | OrderRejectedEvent
  | OrderCancelledEvent
  | TradeExecutedEvent
  | OrderBookUpdatedEvent;
