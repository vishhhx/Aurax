import { cmp, isZero } from "@/lib/decimal"
import type { BookLevel } from "@/lib/api/types"

/**
 * Order-book synchronisation (websocket-api.md, "Depth book algorithm"):
 *
 *   snapshot → replace the book, seq = snapshot sequence
 *   update   → seq' ≤ seq: duplicate, ignore
 *              prev === seq: apply changed levels (quantity "0" removes)
 *              otherwise: gap → stop showing the book and resync
 *   resync   → stop showing the book until the next snapshot
 *
 * Sequence numbers are strings, compared as BigInt; they can restart lower
 * after an engine restart, always behind a fresh snapshot.
 */

export type BookStatus = "waiting" | "synced" | "resyncing"
export type ApplyResult = "applied" | "duplicate" | "gap" | "waiting"

export interface BookView {
  status: BookStatus
  sequenceNumber: string | null
  bids: BookLevel[]
  asks: BookLevel[]
}

const toMap = (levels: BookLevel[]) => {
  const m = new Map<string, string>()
  for (const l of levels) if (!isZero(l.quantity)) m.set(l.price, l.quantity)
  return m
}

const apply = (book: Map<string, string>, levels: BookLevel[]) => {
  for (const l of levels) {
    if (isZero(l.quantity)) book.delete(l.price)
    else book.set(l.price, l.quantity)
  }
}

const sorted = (book: Map<string, string>, descending: boolean): BookLevel[] => {
  const out = [...book].map(([price, quantity]) => ({ price, quantity }))
  out.sort((a, b) => (descending ? cmp(b.price, a.price) : cmp(a.price, b.price)))
  return out
}

export class DepthBook {
  private seq: bigint | null = null
  private status: BookStatus = "waiting"
  private bids = new Map<string, string>()
  private asks = new Map<string, string>()

  snapshot(sequenceNumber: string | number | null | undefined, bids: BookLevel[], asks: BookLevel[]): void {
    this.seq = sequenceNumber === null || sequenceNumber === undefined ? 0n : BigInt(sequenceNumber)
    this.bids = toMap(bids)
    this.asks = toMap(asks)
    this.status = "synced"
  }

  update(sequenceNumber: string | null, prevSequenceNumber: string | undefined, bids: BookLevel[], asks: BookLevel[]): ApplyResult {
    if (this.seq === null || this.status !== "synced") return "waiting"
    if (sequenceNumber === null) return "duplicate"
    const next = BigInt(sequenceNumber)
    if (next <= this.seq) return "duplicate"
    if (prevSequenceNumber === undefined || BigInt(prevSequenceNumber) !== this.seq) {
      this.markResyncing()
      return "gap"
    }
    apply(this.bids, bids)
    apply(this.asks, asks)
    this.seq = next
    return "applied"
  }

  markResyncing(): void {
    this.seq = null
    this.status = "resyncing"
  }

  /** Bids descending, asks ascending. A crossed book never happens on a synced mirror. */
  view(): BookView {
    return {
      status: this.status,
      sequenceNumber: this.seq?.toString() ?? null,
      bids: sorted(this.bids, true),
      asks: sorted(this.asks, false),
    }
  }
}
