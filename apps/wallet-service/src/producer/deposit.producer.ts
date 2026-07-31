import { TOPICS, producer } from "@repo/kafka";
import { CompressionTypes } from "kafkajs";

export interface DepositCompletedEvent {
  event: "deposit.completed";
  userId: string;
  depositId: string;
  assetId: string;
  amount: string;
  balance: string;
  timestamp: string;
}

export async function publishDepositCompletedEvent(
  payload: DepositCompletedEvent,
) {
  await producer.send({
    topic: TOPICS.DEPOSIT_EVENTS,
    compression: CompressionTypes.GZIP,
    acks: -1,
    messages: [
      {
        key: payload.userId,
        value: JSON.stringify(payload),
      },
    ],
  });
}
