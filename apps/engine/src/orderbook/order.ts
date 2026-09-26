import type { OrderSide, OrderType, TimeInForce } from "@repo/pg";

export interface Fill {
  tradeId: string;
  quantity: bigint;
  price: bigint;
  timestamp: number;
}
export interface Order {
  id: string;
  userId: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price: bigint;
  quantity: bigint;
  filledQuantity: bigint;
  timestamp: number;
  sequence: bigint;
  fills: Fill[];
}






