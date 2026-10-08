import { Kafka } from "kafkajs";

export const kafka = new Kafka({
  clientId: "aurax",
  brokers: ["localhost:9092"],
});

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
