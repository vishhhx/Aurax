import { TOPICS } from "@repo/kafka";
import type { Server, Socket } from "socket.io";

import { ENV } from "../config/env";
import logger from "../config/logger";
import { SupervisedConsumer } from "../kafka/supervised-consumer";
import { metrics } from "../utils/metrics";
import { MarketHub } from "./hub";
import { marketEventSchema, type DepthLevel, type MarketMessage } from "./protocol";

const SWEEP_INTERVAL_MS = 5_000;
const SYMBOL_REFRESH_MS = 60_000;
const HTTP_TIMEOUT_MS = 5_000;

let hub: MarketHub | undefined;
let consumer: SupervisedConsumer | undefined;
const timers: Array<ReturnType<typeof setInterval>> = [];

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ENV.MARKET_SERVICE_URL}${path}`, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`market-service ${path} responded ${res.status}`);
  const body = (await res.json()) as { success?: boolean; data?: T };
  if (!body.success || body.data === undefined) throw new Error(`market-service ${path} returned no data`);
  return body.data;
}

/** The exact top-N view market-service publishes deltas for (N returned as `depth`). */
export function fetchDepthSnapshot(symbol: string) {
  return getJson<{ sequenceNumber: string; depth: number; bids: DepthLevel[]; asks: DepthLevel[] }>(
    `/markets/${encodeURIComponent(symbol)}/orderbook?view=published`,
  );
}

async function refreshSymbols(h: MarketHub, starting = false): Promise<boolean> {
  try {
    const markets = await getJson<Array<{ symbol: string }>>("/markets");
    h.setKnownSymbols(markets.map((m) => m.symbol));
    return true;
  } catch (error) {
    // 503 / connection refused while market-service is still starting is expected.
    if (starting) logger.debug({ err: error }, "market-service not ready yet");
    else logger.warn({ err: error }, "Could not refresh tradable symbols from market-service");
    return false;
  }
}

/**
 * Loads the symbol list as soon as market-service is ready (it answers 503
 * while starting), retrying every 2 s; then refreshes every minute. Until the
 * first load, symbols are validated by format only (fail-open for public data).
 */
async function loadSymbolsUntilReady(h: MarketHub): Promise<void> {
  logger.info("Waiting for market-service to become ready");
  while (!(await refreshSymbols(h, true))) {
    await new Promise((r) => setTimeout(r, 2_000));
    if (!hub) return; // stopped
  }
  logger.info("Tradable symbols loaded from market-service");
}

/** Decodes one Kafka value. Returns null for non-market events and invalid payloads. */
export function decodeMarketEvent(value: Buffer | null) {
  if (!value) return null;
  let json: unknown;
  try {
    json = JSON.parse(value.toString("utf8"));
  } catch {
    metrics.inc("ws_market_events_invalid_total", { reason: "json" });
    return null;
  }
  // The same topic carries the engine's raw `orderbook.updated`; ignore it.
  const type = (json as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !type.endsWith(".updated")) return null;

  const parsed = marketEventSchema.safeParse(json);
  if (!parsed.success) {
    metrics.inc("ws_market_events_invalid_total", { reason: "schema" });
    logger.warn({ type, issues: parsed.error.issues.slice(0, 3) }, "Dropping invalid market event");
    return null;
  }
  return parsed.data;
}

export function createMarketHub(io: Server): MarketHub {
  hub = new MarketHub({
    emitter: {
      toRoom(room, message: MarketMessage, volatile) {
        (volatile ? io.to(room).volatile : io.to(room)).emit("market", message);
      },
    },
    maxSubscriptionsPerSocket: ENV.MAX_SUBSCRIPTIONS_PER_SOCKET,
    fetchDepthSnapshot: ENV.MARKET_SERVICE_URL ? fetchDepthSnapshot : undefined,
  });
  const h = hub;

  timers.push(setInterval(() => h.flushTickers(), ENV.TICKER_COALESCE_MS));

  // Backpressure: emits never block the Kafka consumer; ticker updates are
  // coalesced and volatile, and a client whose transport buffer keeps growing
  // is disconnected (it reconnects and gets fresh snapshots).
  timers.push(
    setInterval(() => {
      for (const id of h.subscribedSocketIds()) {
        const socket = io.sockets.sockets.get(id);
        const buffered = (socket?.conn as unknown as { writeBuffer?: unknown[] } | undefined)?.writeBuffer?.length ?? 0;
        if (socket && buffered > ENV.SLOW_CLIENT_BUFFER_LIMIT) {
          metrics.inc("ws_slow_clients_disconnected_total");
          logger.warn({ socketId: id, buffered }, "Disconnecting slow market-data client");
          socket.disconnect(true);
        }
      }
      metrics.set("ws_connected_sockets", io.sockets.sockets.size);
    }, SWEEP_INTERVAL_MS),
  );

  if (ENV.MARKET_SERVICE_URL) {
    void loadSymbolsUntilReady(h);
    timers.push(setInterval(() => void refreshSymbols(h), SYMBOL_REFRESH_MS));
  } else {
    logger.warn("MARKET_SERVICE_URL not set: depth resync waits for periodic Kafka snapshots; symbols validated by format only");
  }

  for (const t of timers) t.unref?.();
  return h;
}

export function registerMarketDataHandlers(socket: Socket): void {
  const h = hub;
  if (!h) return;

  socket.on("market", (payload: unknown, ack?: (r: unknown) => void) => {
    let result;
    try {
      result = h.handleRequest(socket, payload);
    } catch (error) {
      logger.warn({ err: error, socketId: socket.id }, "Market request failed");
      result = { ok: false, error: "internal error" };
    }
    if (typeof ack === "function") ack(result);
    else if (!result.ok) socket.emit("market", { type: "error", error: result.error });
  });

  socket.on("disconnect", () => h.disconnect(socket.id));
}

export async function startMarketDataConsumer(): Promise<void> {
  const h = hub;
  if (!h) throw new Error("createMarketHub must be called first");

  consumer = new SupervisedConsumer({
    name: "market-data",
    // Per-instance group: every gateway instance needs every event.
    groupId: `${ENV.KAFKA_GROUP_PREFIX}.market-data.${ENV.INSTANCE_ID}`,
    topic: TOPICS.MARKET_EVENTS,
    fromBeginning: false, // live fan-out; state comes from snapshots
    ephemeralGroup: true,
    onMessage: async ({ message }) => {
      const event = decodeMarketEvent(message.value);
      if (!event) return;
      metrics.inc("ws_market_events_total", { type: event.type });
      h.handleEvent(event, BigInt(message.offset));
    },
  });
  await consumer.start();
}

export async function stopMarketData(): Promise<void> {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  hub?.stop();
  hub = undefined; // ends the symbol-load retry loop
  await consumer?.stop();
}
