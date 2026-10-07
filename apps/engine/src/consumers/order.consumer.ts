import {
  consumer as Consumer,
  getTopicPartitionCount,
  TOPICS,
} from "@repo/kafka";
import { handleOrderCreated } from "../handlers/order.handlers";
import { EngineMode, engine } from "../matching-engine";
import { RecoveryManager } from "../persistence/recovery";
const topic = TOPICS.ORDER_EVENTS;

export interface meta {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}
export const consumeOrder = async (markets: string[]) => {
  const consumer = Consumer(topic);
  const recoveryManager = new RecoveryManager(engine);
  const positions = new Map<number, string>();

  engine.setMode(EngineMode.RECOVERY);

  for (const symbol of markets) {
    const kafkaPosition = await recoveryManager.recover(
      symbol,
      engine.getOrderBook(symbol),
    );

    if (kafkaPosition) {
      const currentOffset = positions.get(kafkaPosition.partition);

      if (
        currentOffset === undefined ||
        BigInt(kafkaPosition.offset) < BigInt(currentOffset)
      ) {
        positions.set(kafkaPosition.partition, kafkaPosition.offset);
      }
    }
  }

  const partitionCount = await getTopicPartitionCount(topic);
  for (const partition of positions.keys()) {
    if (partition >= partitionCount) {
      console.warn(
        `[Recovery] Ignoring snapshot for unavailable ${topic} partition ${partition}; replaying from the beginning.`,
      );
      positions.delete(partition);
    }
  }

  await consumer.subscribe({
    topic,
    fromBeginning: positions.size === 0,
  });

  for (const [partition, offset] of positions) {
    consumer.seek({
      topic,
      partition,
      offset: (BigInt(offset) + 1n).toString(),
    });
  }

  await consumer.run({
    eachBatch: async ({
      batch,
      resolveOffset,
      heartbeat,
      isRunning,
      isStale,
    }) => {
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) {
          break;
        }

        if (!message.value) {
          resolveOffset(message.offset);
          continue;
        }

        const meta: meta = {
          topic: batch.topic,
          partition: batch.partition,
          offset: message.offset,
          timestamp: message.timestamp,
        };

        try {
          const event = JSON.parse(message.value.toString());
          if (!markets.includes(event.symbol)) {
            resolveOffset(message.offset);
            await heartbeat();
            continue;
          }

          if (event.event === "order.created") {
            await handleOrderCreated(event, meta);
          }

          resolveOffset(message.offset);
          await heartbeat();
        } catch (error) {
          console.error(
            `Failed to process ${batch.topic}:${batch.partition}:${message.offset}`,
            error,
          );
          throw error;
        }
      }

      if (
        engine.getMode() === EngineMode.RECOVERY &&
        batch.messages.length > 0
      ) {
        const lastMessage = batch.messages[batch.messages.length - 1];

        if (
          lastMessage &&
          BigInt(lastMessage.offset) + 1n >= BigInt(batch.highWatermark)
        ) {
          engine.setMode(EngineMode.LIVE);
          console.log(
            `[Recovery] ${batch.topic}:${batch.partition} caught up. LIVE mode.`,
          );
        }
      }
    },
  });
};
