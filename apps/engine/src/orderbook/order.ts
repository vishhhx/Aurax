import type { OrderSide, OrderType, TimeInForce } from "@repo/pg";
import type { meta } from "../consumers/order.consumer";

export interface Fill {
  tradeId: string;

  makerOrderId: string;
  makerUserId: string;

  takerOrderId: string;
  takerUserId: string;

  quantity: number;
  price: number;

  timestamp: number;
}

export interface Order {
  id: string;
  userId: string;

  symbol: string;

  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;

  price: number;
  quantity: number;

  filledQuantity: number;
  remainingQuantity: number;
  executedQuantity: number;

  postOnly: boolean;

  timestamp: number;

  sequenceNumber: number;

  fills: Fill[];
}

export interface OrderSnapshot {
  id: string;
  userId: string;
  symbol: string;

  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";

  price: string;
  quantity: string;
  remainingQuantity: string;

  filledQuantity: string;
  executedQuantity: string;

  sequenceNumber: string;

  postOnly: boolean;
  timeInForce: "GTC" | "IOC" | "FOK";

  kafka: meta;
}

export interface OrderBookSnapshot {
  version: 1;

  symbol: string;

  sequenceNumber: string;

  orders: OrderSnapshot[];
}
