import { consumer as createConsumer } from "@repo/kafka";
import type { Consumer, KafkaMessage } from "kafkajs";
import type { z } from "zod";

import logger from "../config/logger";
import { InvalidEventError } from "../lib/errors";
import { metrics } from "../lib/metrics";
import { health } from "../health";
import { parseEngineEvent } from "../types/engine-events";

const START_ATTEMPTS = 6;

export interface MessageContext {
  topic: string;
  partition: number;
  offset: bigint;
}

export interface ConsumerSpec<T> {
  name: string;
  groupId: string;
  topic: string;
  fromBeginning: boolean;
  eventName: string;
  schema: z.ZodType<T>;
  handle: (event: T, ctx: MessageContext) => Promise<unknown>;
}

/**
 * Processes one Kafka message.
 *
 * - Other event types on a shared topic are ignored.
 * - Malformed payloads and `InvalidEventError`s are logged, counted and
 *   skipped (their offset is committed) so one bad message cannot block a
 *   partition forever.
 * - Any other error is rethrown: kafkajs retries with backoff and does not
 *   commit the offset, so transient failures (Postgres, Kafka publish) never
 *   silently drop a trade.
 *
 * Offsets are committed by kafkajs only after this resolves (at-least-once).
 */
export async function processMessage<T>(
  spec: Pick<ConsumerSpec<T>, "topic" | "eventName" | "schema" | "handle">,
  message: Pick<KafkaMessage, "value" | "offset">,
  partition: number,
): Promise<"processed" | "ignored" | "invalid"> {
  const started = performance.now();
  const ctx = { topic: spec.topic, partition, offset: BigInt(message.offset) };
  const parsed = parseEngineEvent(message.value, spec.eventName, spec.schema);

  if (!parsed.ok) {
    if (parsed.ignored) return "ignored";
    metrics.inc("market_kafka_invalid_messages_total", { topic: spec.topic, reason: "schema" });
    logger.warn({ ...ctx, offset: message.offset, reason: parsed.reason }, "Skipping malformed Kafka message");
    return "invalid";
  }

  try {
    await spec.handle(parsed.event, ctx);
    metrics.inc("market_kafka_messages_total", { topic: spec.topic, outcome: "processed" });
    metrics.observe("market_kafka_processing_ms", performance.now() - started, { topic: spec.topic });
    return "processed";
  } catch (error) {
    if (error instanceof InvalidEventError) {
      metrics.inc("market_kafka_invalid_messages_total", { topic: spec.topic, reason: "invalid_event" });
      logger.warn({ ...ctx, offset: message.offset, reason: error.message }, "Skipping invalid Kafka event");
      return "invalid";
    }

    metrics.inc("market_kafka_messages_total", { topic: spec.topic, outcome: "retry" });
    logger.error({ err: error, ...ctx, offset: message.offset }, "Kafka message processing failed; will retry");
    throw error;
  }
}

export async function startConsumer<T>(spec: ConsumerSpec<T>): Promise<Consumer> {
  const consumer = createConsumer(spec.groupId);
  const { END_BATCH_PROCESS, CRASH } = consumer.events;

  consumer.on(END_BATCH_PROCESS, ({ payload }) => {
    metrics.set("market_kafka_consumer_lag", Number(payload.offsetLag), {
      topic: payload.topic,
      partition: String(payload.partition),
    });
  });

  consumer.on(CRASH, ({ payload }) => {
    logger.error({ err: payload.error, groupId: spec.groupId, restart: payload.restart }, "Kafka consumer crashed");
    if (!payload.restart) {
      health.setConsumer(spec.name, "crashed");
      health.setError(`${spec.name} consumer crashed: ${payload.error.message}`);
    }
  });

  // Transient broker errors (e.g. metadata not yet available for a new group)
  // are retried with bounded backoff instead of failing startup outright.
  for (let attempt = 1; ; attempt++) {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: spec.topic, fromBeginning: spec.fromBeginning });
      await consumer.run({
        eachMessage: async ({ message, partition }) => {
          await processMessage(spec, message, partition);
        },
      });
      break;
    } catch (error) {
      if (attempt >= START_ATTEMPTS) throw error;
      const delay = 500 * 2 ** (attempt - 1);
      logger.warn({ err: error, groupId: spec.groupId, attempt, retryInMs: delay }, "Kafka consumer start failed; retrying");
      await consumer.disconnect().catch(() => undefined);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  health.setConsumer(spec.name, "running");
  logger.info({ groupId: spec.groupId, topic: spec.topic, fromBeginning: spec.fromBeginning }, "Kafka consumer started");
  return consumer;
}
