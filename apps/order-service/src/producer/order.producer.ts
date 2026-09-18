import { TOPICS, producer } from "@repo/kafka";
import type { Order } from "@repo/pg";
import { CompressionTypes } from "kafkajs";

export async function publishOrderCreatedEvent(payload: Order) {
  await producer.send({
    topic: TOPICS.ORDER_EVENTS,
    compression: CompressionTypes.GZIP,
    acks: -1,
    messages: [
      {
        key: payload.userId,
        value: JSON.stringify({ event: "order.created", ...payload }),
      },
    ],
  });
}
