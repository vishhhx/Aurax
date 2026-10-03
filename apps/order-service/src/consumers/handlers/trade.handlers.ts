import orderRepositorie from "../../repositories/order.repositorie";
import type { TradeExecutedEvent } from "../order.consumer";

export const handleTradeExecuted = async (event: TradeExecutedEvent) => {
  try {
    await orderRepositorie.executeTrade(event);
  } catch (error) {
    console.error(
      `Failed to handle trade executed event: ${event.tradeId}`,
      error,
    );
    throw new Error(`Failed to handle trade executed event: ${event.tradeId}`, {
      cause: error,
    });
  }
};
