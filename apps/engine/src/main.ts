import { consumeOrder } from "./consumers/order.consumer";

export const StartEngine = async (markets: string[]) => {
  await consumeOrder(markets);
};
