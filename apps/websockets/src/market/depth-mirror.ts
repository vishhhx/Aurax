import type { DepthEvent, DepthLevel } from "./protocol";

const MAX_BUFFERED_DELTAS = 2_000;

export interface DepthState {
  sequenceNumber: string;
  depth: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface DeltaOut {
  eventId: string;
  sequenceNumber: string;
  prevSequenceNumber: string;
  timestamp: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

/** What a mirror did with an input, so the hub knows what to tell clients. */
export type MirrorResult =
  | { kind: "snapshot"; state: DepthState }
  | { kind: "delta"; delta: DeltaOut }
  | { kind: "duplicate" }
  | { kind: "buffered" }
  | { kind: "gap"; expected: string; got: string };

type Delta = Extract<DepthEvent["data"], { kind: "delta" }>;

const cmp = (a: string, b: string) => {
  // Exact comparison of non-negative decimal strings
  const [ai = "0", af = ""] = a.split(".");
  const [bi = "0", bf = ""] = b.split(".");
  if (ai.length !== bi.length) return ai.length - bi.length;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const fa = af.padEnd(len, "0");
  const fb = bf.padEnd(len, "0");
  return fa === fb ? 0 : fa < fb ? -1 : 1;
};

/**
 * The gateway's replica of market-service's top-N depth view for one symbol.
 *
 * Kafka input for a symbol arrives in partition order. A delta applies only
 * when its `prevSequenceNumber` equals the mirror's sequence; a delta at or
 * below the current sequence is a redelivery and is ignored; anything else is
 * a gap. While unsynced (startup, after a gap) deltas are buffered (bounded)
 * until a snapshot — from Kafka or the REST resync — arrives, after which the
 * buffered deltas that chain onto it are replayed. Snapshots from Kafka are
 * accepted when they come from a newer offset (they are authoritative, even
 * with a lower sequence after an engine restart); REST snapshots are accepted
 * at any time.
 */
export class DepthMirror {
  private synced = false;
  private seq = 0n;
  private depth = 0;
  private readonly bids = new Map<string, string>();
  private readonly asks = new Map<string, string>();
  private lastOffset = -1n;
  private buffer: Array<DepthEvent & { data: Delta }> = [];

  constructor(readonly symbol: string) {}

  get isSynced(): boolean {
    return this.synced;
  }

  get knownDepth(): number {
    return this.depth;
  }

  state(): DepthState | null {
    if (!this.synced) return null;
    const sort = (m: Map<string, string>, desc: boolean) =>
      [...m]
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => (desc ? cmp(b.price, a.price) : cmp(a.price, b.price)));
    return { sequenceNumber: this.seq.toString(), depth: this.depth, bids: sort(this.bids, true), asks: sort(this.asks, false) };
  }

  /** Marks the mirror unsynced (e.g. buffer overflow, client-requested resync). */
  invalidate(): void {
    this.synced = false;
  }

  handleKafka(event: DepthEvent, offset: bigint): MirrorResult {
    if (event.data.kind === "snapshot") {
      if (offset <= this.lastOffset) return { kind: "duplicate" };
      this.lastOffset = offset;
      return { kind: "snapshot", state: this.installSnapshot(event.sequenceNumber, event.data) };
    }

    const delta = event as DepthEvent & { data: Delta };
    if (offset > this.lastOffset) this.lastOffset = offset;
    this.depth = delta.data.depth;

    if (!this.synced) {
      this.bufferDelta(delta);
      return { kind: "buffered" };
    }

    const seq = BigInt(delta.sequenceNumber);
    if (seq <= this.seq) return { kind: "duplicate" };

    if (BigInt(delta.data.prevSequenceNumber) !== this.seq) {
      const expected = this.seq.toString();
      this.synced = false;
      this.buffer = [];
      this.bufferDelta(delta);
      return { kind: "gap", expected, got: delta.data.prevSequenceNumber };
    }

    return { kind: "delta", delta: this.applyDelta(delta) };
  }

  /**
   * Installs an authoritative REST snapshot (market-service's current top-N
   * view) and replays buffered deltas newer than it. Returns the resulting
   * state, or null if the buffered deltas do not chain onto the snapshot
   * (the caller retries later; a Kafka snapshot also resolves it).
   */
  installRestSnapshot(sequenceNumber: string, data: { depth: number; bids: DepthLevel[]; asks: DepthLevel[] }): DepthState | null {
    this.installSnapshot(sequenceNumber, data);
    return this.state();
  }

  private installSnapshot(sequenceNumber: string, data: { depth: number; bids: DepthLevel[]; asks: DepthLevel[] }): DepthState {
    this.seq = BigInt(sequenceNumber);
    this.depth = data.depth;
    this.bids.clear();
    this.asks.clear();
    for (const l of data.bids) this.bids.set(l.price, l.quantity);
    for (const l of data.asks) this.asks.set(l.price, l.quantity);
    this.synced = true;

    const pending = this.buffer;
    this.buffer = [];
    for (const d of pending) {
      const seq = BigInt(d.sequenceNumber);
      if (seq <= this.seq) continue;
      if (BigInt(d.data.prevSequenceNumber) !== this.seq) {
        // Buffered deltas do not continue from this snapshot.
        this.synced = false;
        this.buffer = pending.filter((x) => BigInt(x.sequenceNumber) > this.seq);
        break;
      }
      this.applyDelta(d);
    }
    return this.state() ?? { sequenceNumber: this.seq.toString(), depth: this.depth, bids: [], asks: [] };
  }

  private applyDelta(delta: DepthEvent & { data: Delta }): DeltaOut {
    for (const l of delta.data.bids) (l.quantity === "0" ? this.bids.delete(l.price) : this.bids.set(l.price, l.quantity));
    for (const l of delta.data.asks) (l.quantity === "0" ? this.asks.delete(l.price) : this.asks.set(l.price, l.quantity));
    this.seq = BigInt(delta.sequenceNumber);
    return {
      eventId: delta.eventId,
      sequenceNumber: delta.sequenceNumber,
      prevSequenceNumber: delta.data.prevSequenceNumber,
      timestamp: delta.timestamp,
      bids: delta.data.bids,
      asks: delta.data.asks,
    };
  }

  private bufferDelta(delta: DepthEvent & { data: Delta }): void {
    this.buffer.push(delta);
    if (this.buffer.length > MAX_BUFFERED_DELTAS) {
      // Too far behind; the next snapshot replaces everything anyway.
      this.buffer = [];
    }
  }
}
