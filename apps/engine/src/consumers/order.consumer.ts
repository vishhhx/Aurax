import { consumer as Consumer, kafka, TOPICS } from "@repo/kafka";

import { ENV } from "../config/env";
import { handleOrderCancelRequested, handleOrderCreated } from "../handlers/order.handlers";
import { EngineMode, engine } from "../matching-engine";
import { RecoveryManager } from "../persistence/recovery";
import type { KafkaMessageMeta } from "../types/kafka";
import type { KafkaPosition } from "../types/order";

const topic = TOPICS.ORDER_EVENTS;

/**
 * One consumer group per market shard. Each worker must see every command for
 * its markets; sharing a group across workers (as before) split the
 * partitions so one worker's markets never received commands.
 */
export const engineGroupId = (markets: string[]) =>
  `${ENV.KAFKA_GROUP_PREFIX}.${[...markets].sort().join("-")}`;

async function fetchOffsets(groupId: string) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic }], waitForLeaders: true }); // no-op if it exists
    const [committed] = await admin.fetchOffsets({ groupId, topics: [topic] });
    const highs = await admin.fetchTopicOffsets(topic);
    const highByPartition = new Map(highs.map((h) => [h.partition, BigInt(h.high)]));
    const lowByPartition = new Map(highs.map((h) => [h.partition, BigInt(h.low)]));
    const committedByPartition = new Map<number, bigint>();
    for (const p of committed?.partitions ?? []) {
      const offset = BigInt(p.offset);
      if (offset < 0n) continue;
      // Beyond the log end: committed against an earlier incarnation of the
      // topic (Kafka data was reset). Nothing in the current log is known to be
      // published, so replay all of it LIVE (deduped downstream).
      if (offset > (highByPartition.get(p.partition) ?? 0n)) {
        console.warn(`[Recovery] Ignoring stale committed offset ${offset} for partition ${p.partition}`);
        committedByPartition.set(p.partition, 0n);
        continue;
      }
      committedByPartition.set(p.partition, offset);
    }
    return { committedByPartition, highByPartition, lowByPartition };
  } finally {
    await admin.disconnect();
  }
}

/**
 * Sets the group's committed offsets. Retries while a previous instance of
 * this group is still registered (its session must expire first).
 */
async function setGroupOffsets(groupId: string, starts: Map<number, bigint>): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await admin.setOffsets({
          groupId,
          topic,
          partitions: [...starts].map(([partition, offset]) => ({ partition, offset: offset.toString() })),
        });
        return;
      } catch (error) {
        if (attempt >= 30) throw error;
        console.warn(`[Recovery] Waiting for previous ${groupId} members to leave (${(error as Error).message})`);
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
  } finally {
    await admin.disconnect();
  }
}

/**
 * Recovery and replay semantics
 *
 * 1. Each market's book is restored from its latest snapshot, which records
 *    the Kafka position of the last command it includes.
 * 2. Consumption starts at the oldest snapshot position + 1 per partition
 *    (or at the beginning of the partition when any market lacks a snapshot —
 *    previously the committed offset silently won and the book was lost).
 * 3. Per message: offsets below the group's committed offset were fully
 *    processed and published before the restart → replayed SILENTLY to
 *    rebuild state. Offsets at/after it may not have been published → replayed
 *    LIVE. Trade and event IDs are deterministic, so anything published twice
 *    is deduplicated downstream (order-service, market-service, gateway).
 * 4. The engine reports LIVE over gRPC once every partition has reached the
 *    high watermark observed at startup.
 */
export const consumeOrder = async (markets: string[]): Promise<void> => {
  const groupId = engineGroupId(markets);
  const consumer = Consumer(groupId);
  const recoveryManager = new RecoveryManager(engine);

  const positions = new Map<number, string>();
  const snapshotPositions = new Map<string, KafkaPosition>();

  engine.setMode(EngineMode.RECOVERY);
  engine.setReady(false);

  let missingSnapshot = false;

  for (const symbol of markets) {
    const kafkaPosition = await recoveryManager.recover(symbol, engine.getOrderBook(symbol));

    if (!kafkaPosition) {
      missingSnapshot = true;
      continue;
    }

    snapshotPositions.set(symbol, kafkaPosition);

    const currentOffset = positions.get(kafkaPosition.partition);
    if (currentOffset === undefined || BigInt(kafkaPosition.offset) < BigInt(currentOffset)) {
      positions.set(kafkaPosition.partition, kafkaPosition.offset);
    }
  }

  const { committedByPartition, highByPartition, lowByPartition } = await fetchOffsets(groupId);
  const partitionCount = highByPartition.size;

  const invalidSnapshotPartition = [...positions.keys()].some((partition) => partition >= partitionCount);

  // A snapshot past the log end was taken against an earlier incarnation of
  // the topic (Kafka data was reset); its offsets mean nothing now.
  const staleSnapshot = [...positions].some(
    ([partition, offset]) => BigInt(offset) + 1n > (highByPartition.get(partition) ?? 0n),
  );
  if (staleSnapshot) {
    console.warn(`[Recovery] Snapshot positions are beyond the end of ${topic}; discarding snapshots`);
  }

  // Commands between the snapshot and the log start were deleted by retention:
  // the book cannot be rebuilt correctly, so refuse to start.
  for (const [partition, offset] of positions) {
    const low = lowByPartition.get(partition) ?? 0n;
    if (!staleSnapshot && BigInt(offset) + 1n < low) {
      throw new Error(
        `[Recovery] Snapshot for partition ${partition} ends at ${offset}, but ${topic} now starts at ${low}; commands are missing`,
      );
    }
  }

  if (missingSnapshot || invalidSnapshotPartition || staleSnapshot) {
    engine.generateOrderBooks();
    positions.clear();
    snapshotPositions.clear();
    console.log(`[Recovery] Rebuilding all markets from the beginning of ${topic}`);
  }

  // Where each partition starts, and from which offset processing is LIVE.
  const startByPartition = new Map<number, bigint>();
  const liveFrom = new Map<number, bigint>();
  for (const [partition, high] of highByPartition) {
    const snap = positions.get(partition);
    const start = snap !== undefined ? BigInt(snap) + 1n : (lowByPartition.get(partition) ?? 0n);
    startByPartition.set(partition, start);
    // After a Kafka reset the committed offset may come from a run that
    // replayed silently (nothing published), so replay everything LIVE.
    liveFrom.set(partition, staleSnapshot ? start : (committedByPartition.get(partition) ?? high));
  }

  const caughtUp = new Set<number>();
  const markCaughtUp = (partition: number, nextOffset: bigint) => {
    if (nextOffset >= (highByPartition.get(partition) ?? 0n)) caughtUp.add(partition);
    if (caughtUp.size < partitionCount) return;
    if (engine.getEngineStatus() !== EngineMode.LIVE) {
      engine.setReady(true);
      console.log(`[Recovery] All ${partitionCount} partitions caught up. LIVE.`);
    }
  };
  for (const [partition, start] of startByPartition) markCaughtUp(partition, start);

  // Position the group BEFORE joining, so the first fetch already starts at
  // the recovery point (seeking after run() races the initial fetch).
  await setGroupOffsets(groupId, startByPartition);

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) {
          break;
        }

        const offset = BigInt(message.offset);

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

        let event: { event?: string; symbol?: string };
        try {
          event = JSON.parse(message.value.toString());
        } catch {
          console.error(`[Engine] Skipping non-JSON message ${meta.partition}:${meta.offset}`);
          resolveOffset(message.offset);
          continue;
        }

        if (!event.symbol || !markets.includes(event.symbol)) {
          resolveOffset(message.offset);
          await heartbeat();
          markCaughtUp(batch.partition, offset + 1n);
          continue;
        }

        const snapshotPosition = snapshotPositions.get(event.symbol);

        if (
          snapshotPosition &&
          snapshotPosition.partition === meta.partition &&
          offset <= BigInt(snapshotPosition.offset)
        ) {
          resolveOffset(message.offset);
          await heartbeat();
          continue;
        }

        engine.setMode(offset >= (liveFrom.get(batch.partition) ?? 0n) ? EngineMode.LIVE : EngineMode.RECOVERY);

        try {
          if (event.event === "order.created") {
            await handleOrderCreated(event as never, meta);
          } else if (event.event === "order.cancel_requested") {
            await handleOrderCancelRequested(event as never, meta);
          }
        } catch (error) {
          console.error(`Failed to process ${batch.topic}:${batch.partition}:${message.offset}`, error);
          // Not resolved: kafkajs retries the batch from this message.
          throw error;
        }

        resolveOffset(message.offset);
        await heartbeat();
        markCaughtUp(batch.partition, offset + 1n);
      }

      const lastMessage = batch.messages[batch.messages.length - 1];
      if (lastMessage) markCaughtUp(batch.partition, BigInt(lastMessage.offset) + 1n);
    },
  });

  console.log(
    `[Engine] ${groupId} consuming ${topic}; start=${JSON.stringify(Object.fromEntries([...startByPartition].map(([p, o]) => [p, o.toString()])))}`,
  );
};
