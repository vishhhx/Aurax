import type { Consumer } from "kafkajs";

import type { OrderBookSync } from "../processors/orderbook-sync";
import type { TradePipeline } from "../processors/trade-pipeline";
import { startOrderBookConsumer } from "./orderbook";
import { startTradeConsumer } from "./trade";

export async function startConsumers(deps: {
  pipeline: TradePipeline;
  orderBookSync: OrderBookSync;
}): Promise<Consumer[]> {
  return Promise.all([startOrderBookConsumer(deps.orderBookSync), startTradeConsumer(deps.pipeline)]);
}
