import type { PublicTrade } from "../src/store/trades";
import type { TradeExecutedEvent } from "../src/types/engine-events";

export const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);

let n = 0;
export function trade(overrides: Partial<PublicTrade> = {}): PublicTrade {
  n += 1;
  return {
    tradeId: `t-${String(n).padStart(6, "0")}`,
    symbol: "BTCUSDC",
    price: "100",
    quantity: "1",
    quoteQuantity: "100",
    side: "BUY",
    isBuyerMaker: false,
    timestamp: T0,
    ...overrides,
  };
}

export function engineTrade(overrides: Partial<TradeExecutedEvent> = {}): TradeExecutedEvent {
  n += 1;
  return {
    event: "trade.executed",
    tradeId: `e-${String(n).padStart(6, "0")}`,
    symbol: "BTCUSDC",
    marketId: "BTCUSDC",
    maker: { orderId: "m", userId: "u1", status: "FILLED", side: "SELL" },
    taker: { orderId: "t", userId: "u2", status: "FILLED", side: "BUY" },
    price: "100",
    quantity: "1",
    timestamp: T0,
    ...overrides,
  };
}
