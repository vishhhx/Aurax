import { consumeOrder } from "./consumers/order.consumer";
import { engine } from "./matching-engine";

export const StartEngine = async (markets: string[]) => {
  await engine.load();
  await consumeOrder(markets);
};
