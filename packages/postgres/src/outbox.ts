import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";

/**
 * Transactional outbox.
 *
 * `enqueueOutbox(tx, …)` must be called inside the same Prisma transaction as
 * the state change the event describes: the event exists iff the change
 * committed. `OutboxRelay` publishes committed rows in insertion order and
 * marks them published (at-least-once; consumers deduplicate by `eventId`).
 *
 * Every service that runs a relay competes for one global advisory lock, so
 * exactly one relay publishes at a time and per-key order is preserved even
 * with several service instances.
 */

export interface OutboxMessage {
  topic: string;
  key: string;
  payload: Record<string, unknown> & { eventId: string };
}

export type OutboxSend = (
  topic: string,
  messages: Array<{ key: string; value: string; headers: Record<string, string> }>,
) => Promise<void>;

const RELAY_LOCK_KEY = 0x0a0e0b0c; // arbitrary, shared by every relay

export async function enqueueOutbox(tx: Prisma.TransactionClient, messages: OutboxMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await tx.outboxEvent.createMany({
    data: messages.map((m) => ({ topic: m.topic, key: m.key, payload: m.payload as Prisma.InputJsonValue })),
  });
}

interface Row {
  id: string;
  topic: string;
  key: string;
  payload: Record<string, unknown>;
}

export class OutboxRelay {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private failures = 0;
  private running: Promise<number> | null = null;

  constructor(
    private readonly options: {
      send: OutboxSend;
      intervalMs?: number;
      batchSize?: number;
      onError?: (error: unknown) => void;
    },
  ) {}

  /** Publishes one batch. Returns rows published (0 if another relay holds the lock). */
  async flush(): Promise<number> {
    const batchSize = this.options.batchSize ?? 200;

    return prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${RELAY_LOCK_KEY}) AS locked`;
        if (!lock?.locked) return 0;

        const rows = await tx.$queryRaw<Row[]>`
          SELECT "id", "topic", "key", "payload" FROM "OutboxEvent"
          WHERE "publishedAt" IS NULL
          ORDER BY "createdAt", "id"
          LIMIT ${batchSize}
          FOR UPDATE`;
        if (rows.length === 0) return 0;

        // Preserve order: send consecutive runs of the same topic as one batch.
        let i = 0;
        while (i < rows.length) {
          const topic = rows[i]!.topic;
          const run: Row[] = [];
          while (i < rows.length && rows[i]!.topic === topic) run.push(rows[i++]!);
          await this.options.send(
            topic,
            run.map((r) => ({
              key: r.key,
              value: JSON.stringify(r.payload),
              headers: { "event-id": String(r.payload.eventId ?? r.id) },
            })),
          );
        }

        const ids = rows.map((r) => r.id);
        await tx.$executeRaw`UPDATE "OutboxEvent" SET "publishedAt" = now(), "attempts" = "attempts" + 1
          WHERE "id" = ANY(${ids}::uuid[])`;
        return rows.length;
      },
      { timeout: 30_000 },
    );
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      this.running = this.flush();
      let published = 0;
      try {
        published = await this.running;
        this.failures = 0;
      } catch (error) {
        this.failures += 1;
        this.options.onError?.(error);
      } finally {
        this.running = null;
      }
      const base = this.options.intervalMs ?? 200;
      // Drain quickly while there is a backlog; back off on failures.
      const next = this.failures > 0 ? Math.min(base * 2 ** this.failures, 30_000) : published > 0 ? 0 : base;
      this.schedule(next);
    }, delay);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.running) await this.running.catch(() => undefined);
    // Final drain so committed events are not left behind on shutdown.
    await this.flush().catch((error) => this.options.onError?.(error));
  }
}
