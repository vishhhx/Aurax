import { TOPICS } from "@repo/kafka";

import { ENV } from "../config/env";
import type { OrderBookSync } from "../processors/orderbook-sync";
import { orderBookUpdatedSchema } from "../types/engine-events";
import { startConsumer } from "./runner";

/**
 * `orderbook.updated` full snapshots on `market.events`. Group `<prefix>.orderbook`.
 * Starts from the latest offset: the book is seeded from gRPC first, and only
 * the newest snapshot matters. Market-service's own `market.*` events on the
 * same topic are ignored by the event filter.
 */
export function startOrderBookConsumer(sync: OrderBookSync) {
  return startConsumer({
    name: "orderbook",
    groupId: `${ENV.KAFKA_GROUP_PREFIX}.orderbook`,
    topic: TOPICS.MARKET_EVENTS,
    fromBeginning: false,
    eventName: "orderbook.updated",
    schema: orderBookUpdatedSchema,
    handle: (event, ctx) => sync.handleKafka(event, ctx.offset),
  });
}
