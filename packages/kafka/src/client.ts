import { Kafka } from "kafkajs";

export const kafka = new Kafka({
  clientId: "aurax",
  brokers: ["localhost:9092"],
});

export const TOPICS = {
  DEPOSIT_EVENTS: "deposit.events",
  WITHDRAWAL_EVENTS: "withdrawal.events",
  ORDER_CREATED: "order.created",
  TRADE_EXECUTED: "trade.executed",
  NOTIFICATION_EVENTS: "notification.events",
};

export const producer = kafka.producer();

export const consumer = (groupId: string) => kafka.consumer({ groupId });
