import type { OrderSide, OrderType, TimeInForce } from "@repo/pg";

export interface KafkaPosition {
  topic: string;
  partition: number;
  offset: string;
}

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

export interface OrderBookSnapshot {
  version: number;
  symbol: string;
  sequenceNumber: number;
  orderSequenceNumber: number;
  kafka: KafkaPosition;
  orders: OrderSnapshot[];
}
