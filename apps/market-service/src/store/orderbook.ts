import { compareScaled, toScaled } from "../lib/decimal";

export interface PriceLevel {
  /** Canonical decimal string */
  price: string;
  /** Canonical decimal string */
  quantity: string;
}

export interface OrderBookSnapshot {
  symbol: string;
  /** Matching-engine book sequence number */
  sequenceNumber: bigint;
  /** Best first: bids descending, asks ascending */
  bids: PriceLevel[];
  asks: PriceLevel[];
  /** When this snapshot was applied locally (Unix ms) */
  updatedAt: number;
}

export type ApplyResult =
  | { status: "applied"; gap: bigint }
  /** Older or equal sequence from an older-or-equal Kafka offset: a redelivery. */
  | { status: "stale" }
  /**
   * Older or equal sequence from a NEWER Kafka offset. Either the engine
   * restarted and its book sequence moved backwards, or the producer reordered
   * a retried batch. Only the engine can say which, so the caller must resync
   * from the authoritative gRPC snapshot.
   */
  | { status: "regressed" };

interface BookState {
  snapshot: OrderBookSnapshot;
  /** Offset of the last Kafka message applied, null if the state came from gRPC only. */
  lastOffset: bigint | null;
}

function sortLevels(levels: PriceLevel[], side: "bids" | "asks"): PriceLevel[] {
  const keyed = levels.map((level) => ({ level, price: toScaled(level.price) }));
  keyed.sort((a, b) =>
    side === "bids" ? compareScaled(b.price, a.price) : compareScaled(a.price, b.price),
  );

  for (let i = 1; i < keyed.length; i++) {
    if (keyed[i]!.price === keyed[i - 1]!.price) {
      throw new Error(`Duplicate ${side} price level ${keyed[i]!.level.price}`);
    }
  }

  return keyed.map((k) => ({ price: k.level.price, quantity: k.level.quantity }));
}

/**
 * The single authoritative in-memory order-book store. Initialisation (gRPC),
 * the Kafka consumer, REST controllers and depth publishing all read and
 * write this instance.
 */
export class OrderBookStore {
  private readonly books = new Map<string, BookState>();

  /** Validates ordering, rejects crossed books, and returns a normalised snapshot. */
  static build(input: {
    symbol: string;
    sequenceNumber: bigint;
    bids: PriceLevel[];
    asks: PriceLevel[];
  }): OrderBookSnapshot {
    const bids = sortLevels(input.bids, "bids");
    const asks = sortLevels(input.asks, "asks");
    const bestBid = bids[0];
    const bestAsk = asks[0];

    if (bestBid && bestAsk && toScaled(bestBid.price) >= toScaled(bestAsk.price)) {
      throw new Error(
        `Crossed book for ${input.symbol}: bid ${bestBid.price} >= ask ${bestAsk.price}`,
      );
    }

    return {
      symbol: input.symbol,
      sequenceNumber: input.sequenceNumber,
      bids,
      asks,
      updatedAt: Date.now(),
    };
  }

  has(symbol: string): boolean {
    return this.books.has(symbol);
  }

  symbols(): string[] {
    return [...this.books.keys()];
  }

  /** Unconditionally installs an authoritative (gRPC) snapshot. */
  replace(snapshot: OrderBookSnapshot, kafkaOffset: bigint | null = null): void {
    const current = this.books.get(snapshot.symbol);
    this.books.set(snapshot.symbol, {
      snapshot,
      lastOffset: kafkaOffset ?? current?.lastOffset ?? null,
    });
  }

  /** Applies a full snapshot received from Kafka at `offset`. */
  applyKafkaSnapshot(snapshot: OrderBookSnapshot, offset: bigint): ApplyResult {
    const current = this.books.get(snapshot.symbol);

    if (!current) {
      this.books.set(snapshot.symbol, { snapshot, lastOffset: offset });
      return { status: "applied", gap: 0n };
    }

    const currentSeq = current.snapshot.sequenceNumber;

    if (snapshot.sequenceNumber > currentSeq) {
      this.books.set(snapshot.symbol, { snapshot, lastOffset: offset });
      return { status: "applied", gap: snapshot.sequenceNumber - currentSeq - 1n };
    }

    if (current.lastOffset !== null && offset > current.lastOffset) {
      return { status: "regressed" };
    }

    return { status: "stale" };
  }

  get(symbol: string): OrderBookSnapshot | undefined {
    return this.books.get(symbol)?.snapshot;
  }

  getDepth(symbol: string, limit: number): OrderBookSnapshot | undefined {
    const snapshot = this.get(symbol);
    if (!snapshot) return undefined;
    return {
      ...snapshot,
      bids: snapshot.bids.slice(0, limit),
      asks: snapshot.asks.slice(0, limit),
    };
  }

  clear(): void {
    this.books.clear();
  }
}

export const orderBookStore = new OrderBookStore();
