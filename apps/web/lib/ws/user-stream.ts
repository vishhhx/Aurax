import { userMessageSchema, type UserMessage } from "./schemas"
import type { MarketSocket } from "./market-stream"

/**
 * Private events (socket event "user", authenticated sockets only).
 *
 * Delivery is at-least-once, so events are deduplicated by eventId in one
 * bounded LRU for the whole tab before fan-out. Nothing is replayed across a
 * disconnect: consumers refetch HTTP state on reconnect.
 */

export const DEDUPE_CAPACITY = 5_000

export type UserListener = (message: UserMessage) => void

export class UserStream {
  private readonly seen = new Map<string, true>()
  private readonly listeners = new Set<UserListener>()

  constructor(socket: MarketSocket, private readonly capacity = DEDUPE_CAPACITY) {
    socket.on("user", ((raw: unknown) => this.onMessage(raw)) as never)
  }

  subscribe(listener: UserListener): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private onMessage(raw: unknown) {
    const parsed = userMessageSchema.safeParse(raw)
    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production") console.warn("[user] dropped malformed event", parsed.error.issues[0])
      return
    }
    const m = parsed.data
    if (this.seen.has(m.eventId)) return
    this.seen.set(m.eventId, true)
    if (this.seen.size > this.capacity) this.seen.delete(this.seen.keys().next().value as string)
    this.listeners.forEach((l) => l(m))
  }
}
