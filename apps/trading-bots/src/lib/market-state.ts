import type { Candle, Level } from "./http";

export type BookStatus = "awaiting_snapshot" | "synced" | "unsynced" | "disconnected";

/**
 * Local top-N depth replica following MARKET_DATA_PROTOCOL.md: a snapshot replaces
 * the book, a delta applies only when its prevSequenceNumber equals our sequence,
 * quantity "0" removes a level. Anything else marks the book unsynced.
 */
export class OrderBook {
  bids = new Map<string, string>();
  asks = new Map<string, string>();
  seq: bigint | null = null;
  status: BookStatus = "awaiting_snapshot";
  updatedAt = 0;
  gaps = 0;

  snapshot(seq: string | null, bids: Level[], asks: Level[]): void {
    this.bids = new Map(bids.filter((l) => Number(l.quantity) > 0).map((l) => [l.price, l.quantity]));
    this.asks = new Map(asks.filter((l) => Number(l.quantity) > 0).map((l) => [l.price, l.quantity]));
    this.seq = seq == null ? null : BigInt(seq);
    this.status = "synced";
    this.updatedAt = Date.now();
  }

  /** Returns "gap" when the stream is inconsistent; the caller must resync. */
  delta(prev: string | undefined, seq: string | null, bids: Level[], asks: Level[]): "ok" | "stale" | "gap" {
    if (this.status !== "synced" || this.seq == null || seq == null || prev == null) return this.markGap();
    const s = BigInt(seq);
    if (s <= this.seq) return "stale";
    if (BigInt(prev) !== this.seq) return this.markGap();
    for (const [side, levels] of [[this.bids, bids], [this.asks, asks]] as const) {
      for (const l of levels) Number(l.quantity) === 0 ? side.delete(l.price) : side.set(l.price, l.quantity);
    }
    this.seq = s;
    this.updatedAt = Date.now();
    return "ok";
  }

  private markGap(): "gap" {
    this.status = "unsynced";
    this.gaps++;
    return "gap";
  }

  disconnect(): void {
    this.status = "disconnected";
  }

  get usable() {
    return this.status === "synced";
  }

  levels(side: "bids" | "asks", n = 10): Level[] {
    const m = side === "bids" ? this.bids : this.asks;
    return [...m]
      .map(([price, quantity]) => ({ price, quantity }))
      .sort((a, b) => (side === "bids" ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price)))
      .slice(0, n);
  }

  bestBid = () => (this.usable ? this.levels("bids", 1)[0] : undefined);
  bestAsk = () => (this.usable ? this.levels("asks", 1)[0] : undefined);
  mid(): number | null {
    const b = this.bestBid(), a = this.bestAsk();
    return b && a ? (Number(b.price) + Number(a.price)) / 2 : null;
  }
}

/** Candles exactly as the backend reports them, keyed by openTime. Nothing is synthesized. */
export class CandleSeries {
  private byOpen = new Map<number, Candle>();
  updatedAt = 0;
  source: "none" | "rest" | "live" = "none";

  constructor(public interval: string, private keep = 8) {}

  upsert(c: Candle, source: "rest" | "live"): void {
    if (!c || typeof c.openTime !== "number" || c.open == null) return;
    if (c.interval && c.interval !== this.interval) return;
    this.byOpen.set(c.openTime, c);
    for (const k of [...this.byOpen.keys()].sort((a, b) => a - b).slice(0, -this.keep)) this.byOpen.delete(k);
    this.updatedAt = Date.now();
    this.source = source === "live" || this.source === "live" ? "live" : "rest";
  }

  list(): Candle[] {
    return [...this.byOpen.values()].sort((a, b) => a.openTime - b.openTime);
  }
}
