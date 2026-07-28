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
): Promise<void> {
  await producer.send({
    topic: TOPICS.DEPOSIT_EVENTS,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: payload.userId,
        value: JSON.stringify(payload),
      },
    ],
    acks: -1,
  });

  await producer.disconnect();
}
