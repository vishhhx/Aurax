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

  maker: {
    orderId: string;
    userId: string;
  };

  taker: {
    orderId: string;
    userId: string;
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
