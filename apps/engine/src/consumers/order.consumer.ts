import {
  consumer as Consumer,
  getTopicPartitionCount,
  TOPICS,
} from "@repo/kafka";

import { handleOrderCreated } from "../handlers/order.handlers";
import { EngineMode, engine } from "../matching-engine";
import { RecoveryManager } from "../persistence/recovery";
import type { KafkaMessageMeta } from "../types/kafka";
import type { KafkaPosition } from "../types/order";

const topic = TOPICS.ORDER_EVENTS;

export const consumeOrder = async (markets: string[]): Promise<void> => {
  const consumer = Consumer(topic);
  const recoveryManager = new RecoveryManager(engine);

  const positions = new Map<number, string>();
  const snapshotPositions = new Map<string, KafkaPosition>();
  const caughtUpPartitions = new Set<number>();

  engine.setMode(EngineMode.RECOVERY);

  let missingSnapshot = false;

  for (const symbol of markets) {
    const kafkaPosition = await recoveryManager.recover(
      symbol,
      engine.getOrderBook(symbol),
    );

    if (!kafkaPosition) {
      missingSnapshot = true;
      continue;
    }

    snapshotPositions.set(symbol, kafkaPosition);

    const currentOffset = positions.get(kafkaPosition.partition);

    if (
      currentOffset === undefined ||
      BigInt(kafkaPosition.offset) < BigInt(currentOffset)
    ) {
      positions.set(kafkaPosition.partition, kafkaPosition.offset);
    }
  }

  const partitionCount = await getTopicPartitionCount(topic);

  const invalidSnapshotPartition = [...positions.keys()].some(
    (partition) => partition >= partitionCount,
  );

  if (missingSnapshot || invalidSnapshotPartition) {
    engine.generateOrderBooks();
    positions.clear();
    snapshotPositions.clear();

    console.log(
      `[Recovery] Rebuilding all markets from the beginning of ${topic}`,
    );
  }

  await consumer.subscribe({
    topic,
    fromBeginning: true,
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
          await heartbeat();
          continue;
        }

        const meta: KafkaMessageMeta = {
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

          const snapshotPosition = snapshotPositions.get(event.symbol);

          if (
            snapshotPosition &&
            snapshotPosition.partition === meta.partition &&
            BigInt(meta.offset) <= BigInt(snapshotPosition.offset)
          ) {
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

      const lastMessage = batch.messages[batch.messages.length - 1];

      if (
        lastMessage &&
        BigInt(lastMessage.offset) + 1n >= BigInt(batch.highWatermark)
      ) {
        caughtUpPartitions.add(batch.partition);
      }

      if (
        engine.getMode() === EngineMode.RECOVERY &&
        caughtUpPartitions.size >= partitionCount
      ) {
        engine.setMode(EngineMode.LIVE);

        console.log(
          `[Recovery] All ${partitionCount} partitions caught up. LIVE mode.`,
        );
      }
    },
  });
};
