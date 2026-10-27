import { Kafka } from "kafkajs";

// Comma-separated `host:port` list; defaults to the local docker-compose broker.
const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

export const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? "aurax",
  brokers,
});

/**
 * Topic ownership (see docs/EVENT_FLOWS.md). Partition keys preserve the
 * ordering each flow needs:
 *
 * - order.events      order COMMANDS from order-service (order.created,
 *                     order.cancel_requested). Key = symbol, so the engine sees
 *                     one market's commands in one total order (deterministic
 *                     replay). Consumers: engine workers, websockets (private).
 * - trade.executed    engine EXECUTION REPORTS for a market: trade.executed,
 *                     order.opened, order.cancelled, order.rejected,
 *                     order.cancel_rejected. Key = symbol, so a cancel can never
 *                     overtake the fills that preceded it. Consumers:
 *                     order-service (settlement), market-service (trades),
 *                     websockets (private).
 * - market.events     engine orderbook.updated + market-service v2 market data.
 * - deposit.events    deposit.completed (wallet-service outbox), key = userId.
 * - notification.events balance.updated (wallet-service / order-service
 *                     outbox), key = userId.
 */
export const TOPICS = {
  DEPOSIT_EVENTS: "deposit.events",
  WITHDRAWAL_EVENTS: "withdrawal.events",
  ORDER_EVENTS: "order.events",
  TRADE_EXECUTED: "trade.executed",
  MARKET_EVENTS: "market.events",
  NOTIFICATION_EVENTS: "notification.events",
};

export const producer = kafka.producer();

export async function connectKafka() {
  await producer.connect();
}

export async function disconnectKafka() {
  await producer.disconnect();
}

export const consumer = (groupId: string) => kafka.consumer({ groupId });

export async function getTopicPartitionCount(topic: string): Promise<number> {
  const admin = kafka.admin();

  await admin.connect();

  try {
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
    return (
      metadata.topics.find((item) => item.name === topic)?.partitions.length ??
      0
    );
  } finally {
    await admin.disconnect();
  }
}
