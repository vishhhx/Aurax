import { consumer as createConsumer, kafka } from "@repo/kafka";
import type { Consumer, EachMessagePayload } from "kafkajs";

import logger from "../config/logger";
import { metrics } from "../utils/metrics";

export interface SupervisedConsumerSpec {
  name: string;
  groupId: string;
  topic: string;
  fromBeginning: boolean;
  /** Delete the consumer group on shutdown (per-instance ephemeral groups). */
  ephemeralGroup: boolean;
  onMessage: (payload: EachMessagePayload) => Promise<void>;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Runs a Kafka consumer that keeps delivering after failures.
 *
 * - kafkajs already retries retriable errors and restarts the consumer
 *   itself; when it gives up (CRASH with `restart: false`) the consumer is
 *   recreated here with capped exponential backoff, so a broker outage never
 *   permanently stops delivery.
 * - `onMessage` errors are caught per message: this consumer feeds live
 *   fan-out, so one bad message is logged and skipped instead of blocking the
 *   partition.
 * - `stop()` disconnects and, for per-instance groups, deletes the group so
 *   restarts do not accumulate orphaned groups on the broker.
 */
export class SupervisedConsumer {
  private consumer: Consumer | undefined;
  private stopped = false;
  private attempt = 0;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  running = false;

  constructor(
    private readonly spec: SupervisedConsumerSpec,
    private readonly factory: (groupId: string) => Consumer = createConsumer,
    private readonly baseBackoffMs = 1_000,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const consumer = this.factory(this.spec.groupId);
    this.consumer = consumer;

    consumer.on(consumer.events.CRASH, ({ payload }) => {
      this.running = false;
      logger.error({ err: payload.error, consumer: this.spec.name, restart: payload.restart }, "Kafka consumer crashed");
      metrics.inc("ws_kafka_consumer_crashes_total", { consumer: this.spec.name });
      if (!payload.restart) this.scheduleRestart();
    });
    consumer.on(consumer.events.GROUP_JOIN, () => {
      this.running = true;
      this.attempt = 0;
    });

    try {
      await consumer.connect();
      await consumer.subscribe({ topic: this.spec.topic, fromBeginning: this.spec.fromBeginning });
      await consumer.run({
        eachMessage: async (payload) => {
          try {
            await this.spec.onMessage(payload);
          } catch (error) {
            metrics.inc("ws_kafka_message_errors_total", { consumer: this.spec.name });
            logger.warn(
              { err: error, consumer: this.spec.name, partition: payload.partition, offset: payload.message.offset },
              "Kafka message handling failed; skipped",
            );
          }
        },
      });
      logger.info({ consumer: this.spec.name, groupId: this.spec.groupId, topic: this.spec.topic }, "Kafka consumer started");
    } catch (error) {
      logger.error({ err: error, consumer: this.spec.name }, "Kafka consumer failed to start");
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (this.stopped || this.restartTimer) return;
    const delay = Math.min(this.baseBackoffMs * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    logger.warn({ consumer: this.spec.name, retryInMs: delay }, "Restarting Kafka consumer");
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined;
      await this.consumer?.disconnect().catch(() => undefined);
      if (!this.stopped) await this.connect();
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    await this.consumer?.disconnect().catch(() => undefined);

    if (this.spec.ephemeralGroup) {
      const admin = kafka.admin();
      try {
        await admin.connect();
        await admin.deleteGroups([this.spec.groupId]);
      } catch (error) {
        logger.warn({ err: error, groupId: this.spec.groupId }, "Could not delete consumer group");
      } finally {
        await admin.disconnect().catch(() => undefined);
      }
    }
  }
}
