import logger from "../config/logger";
import { metrics } from "../lib/metrics";
import type { Candle, CandleAggregator } from "../processors/candle";

const BATCH_SIZE = 500;
const MAX_BACKOFF_MS = 60_000;

/**
 * Periodically writes dirty candle revisions to Postgres.
 *
 * - A batch is a snapshot of (key, revision) pairs; only those exact
 *   revisions are acknowledged after the write commits, so a candle updated
 *   during the write stays dirty and is written again next cycle.
 * - On failure nothing is acknowledged and the next attempt backs off
 *   exponentially (capped), so unsaved candles are never dropped.
 * - The upsert itself refuses to overwrite a stored candle with fewer trades.
 */
export class CandlePersistenceWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private failures = 0;
  private stopped = true;

  constructor(
    private readonly aggregator: CandleAggregator,
    private readonly upsert: (candles: Candle[]) => Promise<void>,
    private readonly intervalMs: number,
  ) {}

  /** One persistence pass. Returns the number of candles written. */
  async flush(): Promise<number> {
    let written = 0;

    while (true) {
      const batch = this.aggregator.getDirtyCandles(BATCH_SIZE);
      if (batch.length === 0) break;

      await this.upsert(batch.map((d) => d.candle));
      this.aggregator.acknowledgePersisted(batch.map(({ key, revision }) => ({ key, revision })));
      written += batch.length;

      if (batch.length < BATCH_SIZE) break;
    }

    metrics.set("market_candles_dirty", this.aggregator.getDirtyCount());
    return written;
  }

  private async tick(): Promise<void> {
    try {
      const written = await this.flush();
      if (written > 0) logger.debug({ written }, "Persisted candles");
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      metrics.inc("market_candle_persist_failures_total");
      logger.error(
        { err: error, failures: this.failures, dirty: this.aggregator.getDirtyCount() },
        "Candle persistence failed; candles stay dirty and will be retried",
      );
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    const backoff = Math.min(this.intervalMs * 2 ** this.failures, MAX_BACKOFF_MS);
    this.timer = setTimeout(() => {
      this.running = this.tick().finally(() => {
        this.running = null;
        this.schedule();
      });
    }, this.failures === 0 ? this.intervalMs : backoff);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule();
  }

  /** Stops scheduling, waits for an in-flight pass, then flushes once more. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) await this.running;
    await this.flush();
  }
}
