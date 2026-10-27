import { TOPICS } from "@repo/kafka";

import { ENV } from "../config/env";
import type { TradePipeline } from "../processors/trade-pipeline";
import { tradeExecutedSchema } from "../types/engine-events";
import { startConsumer } from "./runner";

/**
 * `trade.executed` (engine → market-service). Group `<prefix>.trades`.
 * New groups replay the retained log by default; MarketTrade dedupes it.
 */
export function startTradeConsumer(pipeline: TradePipeline) {
  return startConsumer({
    name: "trades",
    groupId: `${ENV.KAFKA_GROUP_PREFIX}.trades`,
    topic: TOPICS.TRADE_EXECUTED,
    fromBeginning: ENV.KAFKA_TRADES_FROM_BEGINNING,
    eventName: "trade.executed",
    schema: tradeExecutedSchema,
    handle: (event) => pipeline.handle(event),
  });
}
