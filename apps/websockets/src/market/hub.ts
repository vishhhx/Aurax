import logger from "../config/logger";
import { metrics } from "../utils/metrics";
import { DepthMirror, type DepthState } from "./depth-mirror";
import {
  parseClientRequest,
  subscriptionKey,
  type CandleEvent,
  type DepthEvent,
  type DepthLevel,
  type MarketEvent,
  type MarketMessage,
  type Subscription,
  type TickerEvent,
  type TradeEvent,
} from "./protocol";

const RECENT_TRADES = 50;
const MAX_SYMBOLS = 500;
const SEEN_EVENT_IDS = 20_000;
const RESYNC_MIN_MS = 1_000;
const RESYNC_MAX_MS = 30_000;

export interface HubSocket {
  id: string;
  join(room: string): unknown;
  leave(room: string): unknown;
  emit(event: string, payload: unknown): unknown;
}

export interface HubEmitter {
  /** Emit to every socket in a room (on this instance). */
  toRoom(room: string, message: MarketMessage, volatile: boolean): void;
}

export interface HubDeps {
  emitter: HubEmitter;
  maxSubscriptionsPerSocket: number;
  /** Authoritative top-N depth from market-service; undefined disables REST resync. */
  fetchDepthSnapshot?: (symbol: string) => Promise<{ sequenceNumber: string; depth: number; bids: DepthLevel[]; asks: DepthLevel[] }>;
}

export type RequestResult =
  | { ok: true; action: string; keys: string[] }
  | { ok: false; error: string };

interface SymbolState {
  depth: DepthMirror;
  ticker?: TickerEvent;
  trades: TradeEvent[]; // newest first
  candles: Map<string, CandleEvent>; // latest per interval
}

/**
 * Routes validated market-service events to socket.io rooms (one room per
 * channel+symbol[+interval]) and serves initial snapshots from in-memory
 * caches — no database or service call per update. Market data is computed
 * upstream; the hub only replicates and forwards it.
 */
export class MarketHub {
  private readonly symbols = new Map<string, SymbolState>();
  private readonly socketSubs = new Map<string, Set<string>>();
  private readonly seenEventIds = new Set<string>();
  private readonly pendingTickers = new Map<string, TickerEvent>();
  private readonly resyncs = new Map<string, { inFlight: boolean; delay: number; timer?: ReturnType<typeof setTimeout> }>();
  private knownSymbols: Set<string> | null = null;
  private stopped = false;

  constructor(private readonly deps: HubDeps) {}

  // ─── Symbols ──────────────────────────────────────────────────────────

  /** Tradable symbols from market-service. Until loaded, any well-formed symbol is accepted. */
  setKnownSymbols(symbols: string[]): void {
    this.knownSymbols = new Set(symbols);
  }

  private isKnown(symbol: string): boolean {
    return !this.knownSymbols || this.knownSymbols.has(symbol) || this.symbols.has(symbol);
  }

  private state(symbol: string): SymbolState | undefined {
    let s = this.symbols.get(symbol);
    if (!s) {
      if (this.symbols.size >= MAX_SYMBOLS) return undefined;
      s = { depth: new DepthMirror(symbol), trades: [], candles: new Map() };
      this.symbols.set(symbol, s);
    }
    return s;
  }

  // ─── Kafka input ──────────────────────────────────────────────────────

  private firstSeen(eventId: string): boolean {
    if (this.seenEventIds.has(eventId)) return false;
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > SEEN_EVENT_IDS) {
      const oldest = this.seenEventIds.values().next();
      if (!oldest.done) this.seenEventIds.delete(oldest.value);
    }
    return true;
  }

  handleEvent(event: MarketEvent, offset: bigint): void {
    const st = this.state(event.symbol);
    if (!st) {
      metrics.inc("ws_market_events_dropped_total", { reason: "symbol_limit" });
      return;
    }

    switch (event.type) {
      case "depth.updated":
        return this.onDepth(st, event, offset);
      case "trades.updated":
        return this.onTrade(st, event);
      case "ticker.updated":
        return this.onTicker(st, event);
      case "candles.updated":
        return this.onCandle(st, event);
    }
  }

  private onDepth(st: SymbolState, event: DepthEvent, offset: bigint): void {
    const result = st.depth.handleKafka(event, offset);
    const key = subscriptionKey({ channel: "depth", symbol: event.symbol });
    metrics.inc("ws_depth_events_total", { result: result.kind });

    switch (result.kind) {
      case "snapshot":
        this.cancelResync(event.symbol);
        this.emitDepthSnapshot(key, event.symbol, result.state);
        return;
      case "delta":
        this.deps.emitter.toRoom(
          key,
          {
            type: "update",
            key,
            channel: "depth",
            symbol: event.symbol,
            eventId: result.delta.eventId,
            sequenceNumber: result.delta.sequenceNumber,
            prevSequenceNumber: result.delta.prevSequenceNumber,
            timestamp: result.delta.timestamp,
            data: { bids: result.delta.bids, asks: result.delta.asks },
          },
          false, // deltas must not be dropped: a client gap would need a resync
        );
        return;
      case "gap":
        metrics.inc("ws_depth_gaps_total", { symbol: event.symbol });
        logger.warn({ symbol: event.symbol, expected: result.expected, got: result.got }, "Depth sequence gap; resyncing");
        this.deps.emitter.toRoom(key, { type: "resync", key, channel: "depth", symbol: event.symbol, reason: "sequence_gap" }, false);
        this.scheduleResync(event.symbol);
        return;
      case "buffered":
        this.scheduleResync(event.symbol);
        return;
      case "duplicate":
        return;
    }
  }

  private onTrade(st: SymbolState, event: TradeEvent): void {
    if (!this.firstSeen(event.eventId)) return; // at-least-once upstream
    st.trades.unshift(event);
    if (st.trades.length > RECENT_TRADES) st.trades.length = RECENT_TRADES;
    const key = subscriptionKey({ channel: "trades", symbol: event.symbol });
    this.deps.emitter.toRoom(key, this.update(key, { channel: "trades", symbol: event.symbol }, event), false);
  }

  private onTicker(st: SymbolState, event: TickerEvent): void {
    // Full state: keep the newest by production time (ticker sequence
    // numbers restart with market-service, timestamps do not).
    if (st.ticker && event.timestamp < st.ticker.timestamp) return;
    st.ticker = event;
    this.pendingTickers.set(event.symbol, event);
  }

  /** Emits at most one (the latest) ticker per symbol per call. */
  flushTickers(): void {
    for (const [symbol, event] of this.pendingTickers) {
      const key = subscriptionKey({ channel: "ticker", symbol });
      this.deps.emitter.toRoom(key, this.update(key, { channel: "ticker", symbol }, event), true);
    }
    this.pendingTickers.clear();
  }

  private onCandle(st: SymbolState, event: CandleEvent): void {
    if (!this.firstSeen(event.eventId)) return;
    const prev = st.candles.get(event.data.interval);
    const newer =
      !prev ||
      event.data.openTime > prev.data.openTime ||
      (event.data.openTime === prev.data.openTime && Number(event.sequenceNumber) >= Number(prev.sequenceNumber));
    if (newer) st.candles.set(event.data.interval, event);
    // Older-period revisions (late trades) are still forwarded; clients key by openTime.
    const sub: Subscription = { channel: "candles", symbol: event.symbol, interval: event.data.interval };
    const key = subscriptionKey(sub);
    this.deps.emitter.toRoom(key, this.update(key, sub, event), false);
  }

  private update(key: string, sub: Subscription, event: TradeEvent | TickerEvent | CandleEvent): MarketMessage {
    return {
      type: "update",
      key,
      ...sub,
      eventId: event.eventId,
      sequenceNumber: event.sequenceNumber,
      timestamp: event.timestamp,
      data: event.data,
    };
  }

  // ─── Depth resync ─────────────────────────────────────────────────────

  private emitDepthSnapshot(key: string, symbol: string, state: DepthState): void {
    this.deps.emitter.toRoom(
      key,
      { type: "snapshot", key, channel: "depth", symbol, sequenceNumber: state.sequenceNumber, data: state },
      false,
    );
  }

  private cancelResync(symbol: string): void {
    const r = this.resyncs.get(symbol);
    if (r?.timer) clearTimeout(r.timer);
    this.resyncs.delete(symbol);
  }

  /**
   * Fetches an authoritative snapshot from market-service while Kafka deltas
   * keep buffering in the mirror, then replays them. Retries with backoff
   * until synced; a Kafka snapshot (periodic, every ~30 s) also resolves it.
   */
  scheduleResync(symbol: string): void {
    const fetch = this.deps.fetchDepthSnapshot;
    if (!fetch || this.stopped) return;
    const st = this.symbols.get(symbol);
    if (!st || st.depth.isSynced) return;

    let r = this.resyncs.get(symbol);
    if (!r) {
      r = { inFlight: false, delay: RESYNC_MIN_MS };
      this.resyncs.set(symbol, r);
    }
    if (r.inFlight || r.timer) return;

    const run = async () => {
      const rr = this.resyncs.get(symbol);
      if (!rr || this.stopped) return;
      rr.timer = undefined;
      rr.inFlight = true;
      try {
        const snap = await fetch(symbol);
        const state = st.depth.installRestSnapshot(snap.sequenceNumber, { depth: snap.depth, bids: snap.bids, asks: snap.asks });
        rr.inFlight = false;
        if (state) {
          metrics.inc("ws_depth_resyncs_total", { symbol, result: "ok" });
          logger.info({ symbol, sequenceNumber: state.sequenceNumber }, "Depth resynced from market-service snapshot");
          this.resyncs.delete(symbol);
          this.emitDepthSnapshot(subscriptionKey({ channel: "depth", symbol }), symbol, state);
          return;
        }
        metrics.inc("ws_depth_resyncs_total", { symbol, result: "no_chain" });
      } catch (error) {
        rr.inFlight = false;
        metrics.inc("ws_depth_resyncs_total", { symbol, result: "error" });
        logger.warn({ err: error, symbol }, "Depth resync request failed");
      }
      if (this.stopped || st.depth.isSynced) return;
      rr.timer = setTimeout(run, rr.delay);
      rr.delay = Math.min(rr.delay * 2, RESYNC_MAX_MS);
    };

    // First attempt immediately (next tick) so concurrent deltas keep buffering.
    r.timer = setTimeout(run, 0);
  }

  // ─── Client requests ──────────────────────────────────────────────────

  snapshot(sub: Subscription): { sequenceNumber: string | null; data: unknown } {
    const st = this.symbols.get(sub.symbol);
    switch (sub.channel) {
      case "depth": {
        const state = st?.depth.state() ?? null;
        return { sequenceNumber: state?.sequenceNumber ?? null, data: state };
      }
      case "ticker":
        return { sequenceNumber: st?.ticker?.sequenceNumber ?? null, data: st?.ticker?.data ?? null };
      case "trades":
        return { sequenceNumber: null, data: (st?.trades ?? []).map((t) => t.data) };
      case "candles": {
        const c = st?.candles.get(sub.interval!);
        return { sequenceNumber: c?.sequenceNumber ?? null, data: c?.data ?? null };
      }
    }
  }

  handleRequest(socket: HubSocket, payload: unknown): RequestResult {
    const parsed = parseClientRequest(payload);
    if (!parsed.ok) {
      metrics.inc("ws_client_requests_total", { result: "invalid" });
      return { ok: false, error: parsed.error };
    }
    const { action, subscriptions } = parsed.request;

    for (const sub of subscriptions) {
      if (!this.isKnown(sub.symbol)) return { ok: false, error: `unknown market: ${sub.symbol}` };
    }

    const subs = this.socketSubs.get(socket.id) ?? new Set<string>();
    const keys = subscriptions.map(subscriptionKey);

    if (action === "subscribe") {
      const added = new Set(keys.filter((k) => !subs.has(k)));
      if (subs.size + added.size > this.deps.maxSubscriptionsPerSocket) {
        return { ok: false, error: `at most ${this.deps.maxSubscriptionsPerSocket} subscriptions per connection` };
      }
      this.socketSubs.set(socket.id, subs);
      subscriptions.forEach((sub, i) => {
        const key = keys[i]!;
        if (subs.has(key)) return; // duplicate subscribe: no second room join, no duplicate delivery
        subs.add(key);
        this.sendSnapshot(socket, key, sub);
        // Join after the synchronous snapshot emit: no update can interleave,
        // so the first update a client sees continues from its snapshot.
        socket.join(key);
      });
    } else if (action === "unsubscribe") {
      for (const key of keys) {
        if (subs.delete(key)) socket.leave(key);
      }
    } else {
      // resync: client detected a gap in its own copy
      subscriptions.forEach((sub, i) => {
        if (subs.has(keys[i]!)) this.sendSnapshot(socket, keys[i]!, sub);
      });
    }

    metrics.inc("ws_client_requests_total", { result: action });
    return { ok: true, action, keys };
  }

  private sendSnapshot(socket: HubSocket, key: string, sub: Subscription): void {
    const snap = this.snapshot(sub);
    if (sub.channel === "depth" && snap.data === null) {
      // Not synced yet: the snapshot is pushed to the room as soon as it is.
      socket.emit("market", { type: "resync", key, channel: "depth", symbol: sub.symbol, reason: "awaiting_snapshot" } satisfies MarketMessage);
      this.state(sub.symbol);
      this.scheduleResync(sub.symbol);
      return;
    }
    socket.emit("market", { type: "snapshot", key, ...sub, sequenceNumber: snap.sequenceNumber, data: snap.data } satisfies MarketMessage);
  }

  disconnect(socketId: string): void {
    this.socketSubs.delete(socketId); // socket.io removes room membership itself
  }

  subscriptionCount(socketId: string): number {
    return this.socketSubs.get(socketId)?.size ?? 0;
  }

  subscribedSocketIds(): string[] {
    return [...this.socketSubs.keys()];
  }

  stop(): void {
    this.stopped = true;
    for (const r of this.resyncs.values()) if (r.timer) clearTimeout(r.timer);
    this.resyncs.clear();
  }
}
