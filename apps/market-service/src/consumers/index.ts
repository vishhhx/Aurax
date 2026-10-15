import { startOrderBookConsumer } from "./orderbook";
import { startTradeConsumer } from "./trade";

export async function startConsumers(): Promise<void> {
  await Promise.all([startOrderBookConsumer(), startTradeConsumer()]);
}
