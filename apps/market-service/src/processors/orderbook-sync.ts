import logger from "../config/logger";
import { InvalidEventError } from "../lib/errors";
import { normalizeDecimal } from "../lib/decimal";
import { metrics } from "../lib/metrics";
import {
  diffDepth,
  toDepthDeltaEvent,
  toDepthSnapshotEvent,
  topN,
  type DepthView,
  type MarketPublisher,
} from "../producers/market";
import { OrderBookStore, type OrderBookSnapshot, type PriceLevel } from "../store/orderbook";
import type { OrderBookUpdatedEvent } from "../types/engine-events";

export interface RawBookSnapshot {
  symbol: string;
  sequenceNumber: string;
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
}

export interface OrderBookSyncDeps {
  store: OrderBookStore;
  /** Authoritative snapshot from the matching engine (gRPC GetOrderBook). */
  fetchSnapshot: (symbol: string) => Promise<RawBookSnapshot>;
  publisher: Pick<MarketPublisher, "publish">;
  depthLevels: number;
  isServed: (symbol: string) => boolean;
  /** Force a full snapshot after this many consecutive deltas (default 500). */
  snapshotEvery?: number;
}

export type BookOutcome = "applied" | "stale" | "resynced" | "unknown_market";

function levels(raw: Array<{ price: string; quantity: string }>): PriceLevel[] {
  return raw.map((l) => ({ price: normalizeDecimal(l.price), quantity: normalizeDecimal(l.quantity) }));
}

export function snapshotFromRaw(raw: RawBookSnapshot): OrderBookSnapshot {
  if (!/^\d+$/.test(raw.sequenceNumber)) {
    throw new Error(`Invalid order-book sequence number: ${raw.sequenceNumber}`);
  }
  return OrderBookStore.build({
    symbol: raw.symbol,
    sequenceNumber: BigInt(raw.sequenceNumber),
    bids: levels(raw.bids),
    asks: levels(raw.asks),
  });
}

interface PublishedDepth {
  sequenceNumber: bigint;
  view: DepthView;
  deltasSinceSnapshot: number;
}

/**
 * Keeps `OrderBookStore` in sync with the matching engine and publishes
 * `depth.updated` for every applied state.
 *
 * Input protocol (engine `publishOrderBook`): every `orderbook.updated` is a
 * full snapshot and the per-symbol sequence increases by one per event. A
 * newer sequence replaces the book; an engine-sequence gap means skipped
 * snapshots and needs no recovery. An older sequence at a newer Kafka offset
 * means the engine sequence moved backwards (engine restart) or the producer
 * reordered a retry — the book is reloaded from gRPC (authoritative).
 *
 * Output protocol: one depth event per applied state, either
 * - `snapshot` (top-N view): first publication, after a resync, after a failed
 *   publication, after `snapshotEvery` deltas, and on the periodic timer; or
 * - `delta` with `prevSequenceNumber` = the previously PUBLISHED sequence.
 * A consumer applies a delta only when its own sequence equals
 * `prevSequenceNumber`; otherwise it has a gap and must take a snapshot
 * (Kafka snapshot or `GET /markets/:symbol/orderbook?limit=<depth>`, which
 * returns the same top-N view at its sequence number). Transitions are never
 * dropped silently: a failed publish breaks the chain on purpose so the next
 * event is a snapshot.
 *
 * Work for a symbol is serialised so a resync cannot interleave with a Kafka
 * update for the same book.
 */
export class OrderBookSync {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly published = new Map<string, PublishedDepth>();
  private readonly snapshotEvery: number;

  constructor(private readonly deps: OrderBookSyncDeps) {
    this.snapshotEvery = deps.snapshotEvery ?? 500;
  }

  private serialize<T>(symbol: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(symbol) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.chains.set(
      symbol,
      next.catch(() => undefined),
    );
    return next;
  }

  /** Loads every book from gRPC and publishes an initial snapshot for each. */
  async initialize(symbols: string[]): Promise<void> {
    await Promise.all(
      symbols.map((s) =>
        this.serialize(s, async () => {
          const snapshot = await this.loadFromEngine(s, null, "initialize");
          await this.publishDepth(snapshot, true);
        }),
      ),
    );
  }

  /** Re-publishes a full snapshot of every book (late-joiner / heartbeat). */
  async publishSnapshots(): Promise<void> {
    await Promise.all(
      this.deps.store.symbols().map((s) =>
        this.serialize(s, async () => {
          const snapshot = this.deps.store.get(s);
          if (snapshot) await this.publishDepth(snapshot, true);
        }),
      ),
    );
  }

  handleKafka(event: OrderBookUpdatedEvent, offset: bigint): Promise<BookOutcome> {
    if (!this.deps.isServed(event.symbol)) {
      metrics.inc("market_orderbook_updates_total", { outcome: "unknown_market" });
      return Promise.resolve("unknown_market");
    }

    return this.serialize(event.symbol, async () => {
      let snapshot: OrderBookSnapshot;
      try {
        snapshot = OrderBookStore.build({
          symbol: event.symbol,
          sequenceNumber: BigInt(event.sequenceNumber),
          bids: event.bids,
          asks: event.asks,
        });
      } catch (error) {
        throw new InvalidEventError(error instanceof Error ? error.message : String(error));
      }

      const result = this.deps.store.applyKafkaSnapshot(snapshot, offset);
      metrics.inc("market_orderbook_updates_total", { outcome: result.status, symbol: event.symbol });

      if (result.status === "stale") return "stale";

      if (result.status === "regressed") {
        logger.warn(
          { symbol: event.symbol, sequenceNumber: event.sequenceNumber, offset: offset.toString() },
          "Order-book sequence moved backwards at a newer offset; resyncing from matching engine",
        );
        const reloaded = await this.loadFromEngine(event.symbol, offset, "sequence regression");
        await this.publishDepth(reloaded, true);
        return "resynced";
      }

      if (result.gap > 0n) {
        metrics.inc("market_orderbook_sequence_gaps_total", { symbol: event.symbol }, Number(result.gap));
        logger.warn(
          { symbol: event.symbol, missed: result.gap.toString(), sequenceNumber: event.sequenceNumber },
          "Engine order-book sequence gap (full-snapshot input: newest snapshot applied)",
        );
      }

      await this.publishDepth(snapshot, false);
      return "applied";
    });
  }

  private async loadFromEngine(symbol: string, offset: bigint | null, reason: string): Promise<OrderBookSnapshot> {
    const snapshot = snapshotFromRaw(await this.deps.fetchSnapshot(symbol));
    if (snapshot.symbol !== symbol) {
      throw new Error(`Engine returned book for ${snapshot.symbol}, expected ${symbol}`);
    }
    this.deps.store.replace(snapshot, offset);
    logger.info({ symbol, sequenceNumber: snapshot.sequenceNumber.toString(), reason }, "Order book loaded from matching engine");
    return snapshot;
  }

  /**
   * Publishes the state as a snapshot or as a delta against the last
   * published view. A publish failure is logged and resets the chain (the
   * next publication is a snapshot) instead of being retried: retrying the
   * Kafka input would now be "stale" and could never republish anyway.
   */
  private async publishDepth(snapshot: OrderBookSnapshot, forceSnapshot: boolean): Promise<void> {
    const depth = this.deps.depthLevels;
    const view = topN(snapshot, depth);
    const previous = this.published.get(snapshot.symbol);

    const asSnapshot =
      forceSnapshot ||
      !previous ||
      previous.deltasSinceSnapshot >= this.snapshotEvery ||
      snapshot.sequenceNumber <= previous.sequenceNumber;

    const event = asSnapshot
      ? toDepthSnapshotEvent(snapshot.symbol, snapshot.sequenceNumber, view, depth)
      : toDepthDeltaEvent(snapshot.symbol, snapshot.sequenceNumber, previous!.sequenceNumber, diffDepth(previous!.view, view), depth);

    try {
      await this.deps.publisher.publish([event]);
      this.published.set(snapshot.symbol, {
        sequenceNumber: snapshot.sequenceNumber,
        view,
        deltasSinceSnapshot: asSnapshot ? 0 : previous!.deltasSinceSnapshot + 1,
      });
    } catch {
      // Already logged and counted by the publisher.
      this.published.delete(snapshot.symbol);
    }
  }
}
