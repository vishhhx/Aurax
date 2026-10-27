/**
 * Real socket.io server + real socket.io-client connections, using the
 * production gateway wiring (auth, rooms, market hub, private delivery).
 * Kafka is replaced by feeding validated events straight into the hub.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { signToken } from "@repo/core/jwt";

import { attachGateway } from "../src/gateway";
import { createMarketHub, stopMarketData } from "../src/market/market-data";
import type { MarketHub } from "../src/market/hub";
import { deliverUserEvents, mapExecutionReport, mapNotificationEvent } from "../src/private/user-events";
import { depthDelta, depthSnapshot, L, tradeEvent } from "./fixtures";

const SECRET = "test-only-secret";
let http: HttpServer;
let io: Server;
let hub: MarketHub;
let url = "";
const clients: ClientSocket[] = [];

const token = (userId: string) => signToken({ userId, name: userId, email: `${userId}@test` }, SECRET, "5m");

function client(opts: { userId?: string; rawToken?: string; cookie?: boolean } = {}): Promise<ClientSocket> {
  const t = opts.rawToken ?? (opts.userId ? token(opts.userId) : undefined);
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    ...(opts.cookie ? { extraHeaders: { cookie: `theme=dark; accessToken=${t}` } } : { auth: t ? { token: t } : {} }),
  });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

const request = (s: ClientSocket, payload: unknown) =>
  new Promise<any>((resolve) => s.emit("market", payload, (ack: unknown) => resolve(ack)));

function collect(s: ClientSocket, event: "market" | "user") {
  const got: any[] = [];
  s.on(event, (m: unknown) => got.push(m));
  return got;
}

const settle = () => new Promise((r) => setTimeout(r, 40));

beforeAll(async () => {
  http = createServer();
  io = new Server(http);
  hub = createMarketHub(io);
  attachGateway(io, { jwtSecret: SECRET });
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await stopMarketData();
  io.close();
  http.closeAllConnections();
});

describe("authentication and access policy", () => {
  const session = (s: ClientSocket) => new Promise<any>((r) => s.once("session", r));

  test("anonymous connections are allowed and get a public-only session", async () => {
    const pending = connect(url, { transports: ["websocket"], reconnection: false });
    clients.push(pending);
    const info = await session(pending);
    expect(info).toEqual({ authenticated: false });
  });

  test("forged or wrong-secret tokens degrade to public-only (never authenticated)", async () => {
    const forged = connect(url, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token: signToken({ userId: "alice", name: "e", email: "e" }, "wrong-secret", "5m") },
    });
    clients.push(forged);
    expect(await session(forged)).toEqual({ authenticated: false, reason: "invalid_token" });
  });

  test("handshake token and accessToken cookie both authenticate", async () => {
    for (const cookie of [false, true]) {
      const t = token("alice");
      const s = connect(url, {
        transports: ["websocket"],
        reconnection: false,
        ...(cookie ? { extraHeaders: { cookie: `theme=dark; accessToken=${t}` } } : { auth: { token: t } }),
      });
      clients.push(s);
      expect(await session(s)).toEqual({ authenticated: true, userId: "alice" });
    }
  });
});

describe("market data over real sockets", () => {
  test("subscribe → snapshot → updates for that symbol only; duplicate subscribe does not duplicate delivery", async () => {
    hub.handleEvent(depthSnapshot(5, [L("99", "1")], [L("101", "1")], "BTCUSDC"), 1n);
    const s = await client({ userId: "u1" });
    const got = collect(s, "market");

    expect(await request(s, { action: "subscribe", channel: "depth", symbol: "BTC-USDC" })).toMatchObject({ ok: true });
    expect(await request(s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" })).toMatchObject({ ok: true });
    await request(s, { action: "subscribe", channel: "trades", symbol: "BTCUSDC" });

    hub.handleEvent(depthDelta(5, 6, [L("99", "2")], [], "BTCUSDC"), 2n);
    hub.handleEvent(depthSnapshot(1, [], [], "ETHUSDC"), 3n); // unrelated symbol
    hub.handleEvent(tradeEvent("x1", "BTCUSDC"), 4n);
    hub.handleEvent(tradeEvent("x2", "ETHUSDC"), 5n); // unrelated symbol
    await settle();

    expect(got.map((m) => `${m.type}:${m.channel}:${m.symbol}:${m.sequenceNumber ?? m.data?.tradeId ?? ""}`)).toEqual([
      "snapshot:depth:BTCUSDC:5",
      "snapshot:trades:BTCUSDC:",
      "update:depth:BTCUSDC:6",
      "update:trades:BTCUSDC:x1",
    ]);
    expect(got[2]).toMatchObject({ prevSequenceNumber: "5", data: { bids: [L("99", "2")] } });
  });

  test("unsubscribe stops delivery; disconnect releases the subscription", async () => {
    const s = await client({ userId: "u2" });
    const got = collect(s, "market");
    await request(s, { action: "subscribe", channel: "trades", symbol: "SOLUSDC" });
    hub.handleEvent(tradeEvent("s1", "SOLUSDC"), 10n);
    await settle();
    await request(s, { action: "unsubscribe", channel: "trades", symbol: "SOLUSDC" });
    hub.handleEvent(tradeEvent("s2", "SOLUSDC"), 11n);
    await settle();
    expect(got.filter((m) => m.type === "update").map((m) => m.data.tradeId)).toEqual(["s1"]);

    await request(s, { action: "subscribe", channel: "ticker", symbol: "SOLUSDC" });
    const id = s.id!;
    expect(hub.subscriptionCount(id)).toBe(1);
    s.disconnect();
    await settle();
    expect(hub.subscriptionCount(id)).toBe(0);
  });

  test("invalid requests are rejected without affecting the connection", async () => {
    const s = await client({ userId: "u3" });
    expect(await request(s, { action: "subscribe", channel: "orders", symbol: "BTCUSDC" })).toEqual({ ok: false, error: "unsupported channel: orders" });
    expect(await request(s, "garbage")).toMatchObject({ ok: false });
    const errors = collect(s, "market");
    s.emit("market", { action: "subscribe", channel: "candles", symbol: "BTCUSDC" }); // no ack → error message
    await settle();
    expect(errors[0]).toMatchObject({ type: "error" });
    expect(s.connected).toBe(true);
    expect(await request(s, { action: "subscribe", channel: "ticker", symbol: "BTCUSDC" })).toMatchObject({ ok: true });
  });
});

describe("private events", () => {
  test("delivered only to the authenticated owner, never to other users or market rooms", async () => {
    const alice = await client({ userId: "alice" });
    const alice2 = await client({ userId: "alice" }); // second tab
    const bob = await client({ userId: "bob" });
    const mallory = await client({ userId: "mallory" });
    const [a1, a2, b, m] = [collect(alice, "user"), collect(alice2, "user"), collect(bob, "user"), collect(mallory, "user")];
    const marketSeen = collect(mallory, "market");

    // Mallory cannot claim someone else's identity through the protocol
    expect(await request(mallory, { action: "subscribe", channel: "user", symbol: "alice" })).toMatchObject({ ok: false });

    deliverUserEvents(
      io,
      mapExecutionReport({
        event: "trade.executed",
        tradeId: "t9",
        symbol: "BTCUSDC",
        maker: { orderId: "a-order", userId: "alice", status: "FILLED", side: "SELL" },
        taker: { orderId: "b-order", userId: "bob", status: "FILLED", side: "BUY" },
        price: "100",
        quantity: "1",
        timestamp: 1,
      }),
    );
    await settle();

    expect(a1.map((x) => `${x.type}:${x.data.orderId}`)).toEqual(["trade.executed:a-order", "order.filled:a-order"]);
    expect(a2.map((x) => x.data.orderId)).toEqual(["a-order", "a-order"]);
    expect(b.map((x) => x.data.orderId)).toEqual(["b-order", "b-order"]);
    expect(m).toHaveLength(0);
    expect(marketSeen.filter((x) => x.type === "update")).toHaveLength(0);
    expect(JSON.stringify(a1)).not.toContain("bob");
  });

  test("anonymous sockets receive public market data but never private events", async () => {
    const anon = connect(url, { transports: ["websocket"], reconnection: false });
    clients.push(anon);
    await new Promise<void>((r) => anon.once("connect", () => r()));
    const priv = collect(anon, "user");
    const pub = collect(anon, "market");
    expect(await request(anon, { action: "subscribe", channel: "trades", symbol: "BTCUSDC" })).toMatchObject({ ok: true });

    hub.handleEvent(tradeEvent("pub-1", "BTCUSDC"), 100n);
    deliverUserEvents(
      io,
      mapNotificationEvent({
        event: "balance.updated", eventId: "b1", userId: "alice", assetId: "usdc", asset: "USDC",
        available: "1", locked: "0", total: "1", reason: "DEPOSIT", referenceId: "d1", version: 1, timestamp: 1,
      }),
    );
    await settle();
    expect(pub.some((m) => m.type === "update" && m.data.tradeId === "pub-1")).toBe(true);
    expect(priv).toHaveLength(0);
  });
});
