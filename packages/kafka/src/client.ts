import { Kafka } from "kafkajs";

export const kafka = new Kafka({
  clientId: "aurax",
  brokers: ["localhost:9092"],
});



