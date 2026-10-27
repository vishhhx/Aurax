import { io, type Socket } from "socket.io-client";
import { z } from "zod";
import { ENV } from "./config";
import { CandleSeries, OrderBook } from "./market-state";

const level = z.object({ price: z.string(), quantity: z.string() });
const depthData = z.object({ bids: z.array(level), asks: z.array(level) });
const message = z.object({
  type: z.enum(["snapshot", "update", "resync", "error"]),
  channel: z.string().optional(),
  symbol: z.string().optional(),
  interval: z.string().optional(),
  sequenceNumber: z.string().nullable().optional(),
  prevSequenceNumber: z.string().optional(),
  data: z.unknown().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

export interface MarketFeedEvents {
  onUserEvent?: (e: unknown) => void;
  onTicker?: (lastPrice: string | null) => void;
  onError?: (msg: string) => void;
  onSession?: (s: { authenticated: boolean; reason?: string }) => void;
}

/**
 * One socket.io connection per bot to apps/websockets. Public channels:
 * depth, candles(1m), ticker on event "market". Private: event "user" for the
 * token's userId. socket.io reconnects with bounded backoff; we resubscribe on
 * every (re)connect and drop the book on disconnect so stale depth is never used.
 */
export class MarketFeed {
  socket: Socket;
  connected = false;
  lastMessageAt = 0;
  malformed = 0;

  constructor(
    public symbol: string,
    public book: OrderBook,
    public candles: CandleSeries,
    token: () => string | undefined,
    private ev: MarketFeedEvents = {},
  ) {
    this.socket = io(ENV.WS_URL, {
      transports: ["websocket"],
      auth: (cb) => cb({ token: token() }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.3,
    });
    this.socket.on("connect", () => {
      this.connected = true;
      this.book.status = "awaiting_snapshot";
      this.socket.emit("market", {
        action: "subscribe",
        subscriptions: [
          { channel: "depth", symbol },
          { channel: "candles", symbol, interval: candles.interval },
          { channel: "ticker", symbol },
        ],
      });
    });
    this.socket.on("disconnect", () => {
      this.connected = false;
      this.book.disconnect();
    });
    this.socket.on("connect_error", (e) => ev.onError?.(`ws connect_error: ${e.message}`));
    this.socket.on("session", (s) => ev.onSession?.(s));
    this.socket.on("user", (e) => ev.onUserEvent?.(e));
    this.socket.on("market", (raw) => this.handle(raw));
  }

  resync(): void {
    this.socket.emit("market", { action: "resync", channel: "depth", symbol: this.symbol });
  }

  private handle(raw: unknown): void {
    const parsed = message.safeParse(raw);
    if (!parsed.success) return void this.malformed++;
    const m = parsed.data;
    this.lastMessageAt = Date.now();
    if (m.type === "error") return this.ev.onError?.(`ws error: ${m.message ?? JSON.stringify(raw)}`);
    if (m.symbol && m.symbol !== this.symbol) return;

    if (m.channel === "depth") {
      if (m.type === "resync") return void (this.book.status = "unsynced");
      const d = depthData.safeParse(m.data);
      if (!d.success) return void this.malformed++;
      if (m.type === "snapshot") this.book.snapshot(m.sequenceNumber ?? null, d.data.bids, d.data.asks);
      else if (this.book.delta(m.prevSequenceNumber, m.sequenceNumber ?? null, d.data.bids, d.data.asks) === "gap") this.resync();
    } else if (m.channel === "candles") {
      const items = Array.isArray(m.data) ? m.data : m.data ? [m.data] : [];
      for (const c of items) this.candles.upsert(c as never, "live");
    } else if (m.channel === "ticker") {
      const t = m.data as { lastPrice?: string | null } | null;
      if (t && "lastPrice" in t) this.ev.onTicker?.(t.lastPrice ?? null);
    }
  }

  close(): void {
    this.socket.close();
    this.connected = false;
  }
}
