// End-to-end driver (isolated infra). Phases: setup | main | after-restart | final
import { createHmac } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import { signToken } from "@repo/core/jwt";
import { Prisma, prisma, reconcileWallets } from "@repo/pg";

const API = "http://127.0.0.1:15000";
const GW1 = "http://127.0.0.1:15005";
const GW2 = "http://127.0.0.1:15006";
const SECRET = "e2e-secret";
const WHSEC = "e2e-whsec";
const RUN = process.env.E2E_RUN ?? "r1";
const U = { alice: `alice-${RUN}`, bob: `bob-${RUN}`, carol: `carol-${RUN}` };
const phase = process.argv[2];

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | undefined | false | Promise<T | undefined | false>, ms = 8000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await sleep(100);
  }
  return undefined;
}

const token = (userId: string) => signToken({ userId, name: userId, email: `${userId}@e2e` }, SECRET, "1h");
async function http(method: string, path: string, user?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${token(user)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const order = (user: string, side: "BUY" | "SELL", price: string, quantity: string) =>
  http("POST", "/api/v1/order", user, { symbol: "BTC-USDC", side, orderType: "LIMIT", price, quantity });

function client(url: string, user?: string) {
  const s = connect(url, { transports: ["websocket"], reconnection: true, reconnectionDelay: 200, ...(user ? { auth: { token: token(user) } } : {}) });
  const market: any[] = [];
  const priv: any[] = [];
  s.on("market", (m) => market.push(m));
  s.on("user", (m) => priv.push(m));
  return { s, market, priv, ready: new Promise<void>((r) => s.once("connect", () => r())) };
}
const ask = (s: Socket, p: unknown) => new Promise<any>((r) => s.emit("market", p, r));

async function assets() {
  const rows = await prisma.asset.findMany({ where: { symbol: { in: ["BTC", "USDC"] } } });
  return Object.fromEntries(rows.map((a) => [a.symbol, a.assetId])) as { BTC: string; USDC: string };
}
async function wallet(userId: string, assetId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId_assetId: { userId, assetId } } });
  return { available: w?.availableBalance.toFixed() ?? "0", locked: w?.lockedBalance.toFixed() ?? "0" };
}
async function orderRow(orderId: string) {
  const o = await prisma.order.findUnique({ where: { orderId } });
  return o ? `${o.status}:${o.executedQuantity.toFixed()}/${o.remainingQuantity.toFixed()}` : "missing";
}

/** Simulated Razorpay: a PENDING deposit row + a correctly signed payment.captured webhook. */
async function deposit(userId: string, assetId: string, amount: string, replay = false) {
  const d = await prisma.deposit.create({ data: { userId, assetId, amount, orderId: `order_${crypto.randomUUID()}` } });
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${d.depositId}`, order_id: d.orderId } } } });
  const sig = createHmac("sha256", WHSEC).update(body).digest("hex");
  const post = () =>
    fetch("http://127.0.0.1:15002/webhook/razorpay", { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig }, body });
  const r1 = await post();
  const r2 = replay ? await post() : null;
  return { depositId: d.depositId, statuses: [r1.status, r2?.status] };
}

const A = await assets();

if (phase === "main") {
  // ── Sockets: alice on gw1, bob + carol on gw2, anonymous on both ──
  const alice = client(GW1, U.alice);
  const bob = client(GW2, U.bob);
  const carol = client(GW2, U.carol);
  const anon1 = client(GW1);
  const anon2 = client(GW2);
  await Promise.all([alice.ready, bob.ready, carol.ready, anon1.ready, anon2.ready]);
  await sleep(300);

  // ── Scenario F: anonymous public subscriptions ──
  const sub = await ask(anon1.s, {
    action: "subscribe",
    subscriptions: [
      { channel: "depth", symbol: "BTC-USDC" },
      { channel: "trades", symbol: "BTC-USDC" },
      { channel: "ticker", symbol: "BTC-USDC" },
      { channel: "candles", symbol: "BTC-USDC", interval: "1m" },
    ],
  });
  check("F anonymous client can subscribe to public channels", sub.ok === true, JSON.stringify(sub.keys));
  check("F invalid subscription rejected safely", (await ask(anon1.s, { action: "subscribe", channel: "orders", symbol: "BTCUSDC" })).ok === false);
  check("F unknown market rejected", (await ask(anon1.s, { action: "subscribe", channel: "depth", symbol: "DOGE-USDC" })).ok === false);
  await ask(anon2.s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });

  // ── Scenario E: deposits + notifications across gateways ──
  const dA = await deposit(U.alice, A.BTC, "5", true);
  const dB = await deposit(U.bob, A.USDC, "5000");
  await deposit(U.alice, A.USDC, "100");
  check("E webhook accepted (and replay acknowledged)", dA.statuses[0] === 200 && dA.statuses[1] === 200, JSON.stringify(dA.statuses));
  const ledgerA = await prisma.ledger.count({ where: { referenceId: dA.depositId } });
  check("E replayed webhook credited once", ledgerA === 1 && (await wallet(U.alice, A.BTC)).available === "5", `ledger rows ${ledgerA}`);
  const aDep = await waitFor(() => alice.priv.find((m) => m.type === "deposit.completed" && m.data.depositId === dA.depositId));
  const bBal = await waitFor(() => bob.priv.find((m) => m.type === "balance.updated" && m.data.reason === "DEPOSIT"));
  check("E/H alice (gw1) got her deposit notification", !!aDep);
  check("E/H bob (gw2) got balance.updated for his deposit", !!bBal && bBal.data.available === "5000");
  check("E no cross-user leakage (carol got nothing)", carol.priv.length === 0 && anon1.priv.length === 0 && anon2.priv.length === 0);

  // ── Scenario A: resting limit order ──
  const a1 = await order(U.alice, "SELL", "101", "1");
  check("A order accepted (202) via API gateway", a1.status === 202, `${a1.status} ${a1.body?.message}`);
  const a1Id = a1.body?.data?.order?.orderId;
  const opened = await waitFor(() => alice.priv.find((m) => m.type === "order.opened" && m.data.orderId === a1Id));
  check("A engine opened the order (private order.opened)", !!opened);
  check("A order OPEN in order history", (await waitFor(async () => ((await orderRow(a1Id)).startsWith("OPEN") ? true : undefined))) === true, await orderRow(a1Id));
  check("A funds reserved (1 BTC locked)", JSON.stringify(await wallet(U.alice, A.BTC)) === JSON.stringify({ available: "4", locked: "1" }));
  const depthAsk = await waitFor(() =>
    anon1.market.find((m) => m.channel === "depth" && (m.type === "update" || m.type === "snapshot") && JSON.stringify(m.data).includes('"101"')),
  );
  check("A public depth shows the ask (anonymous, gw1)", !!depthAsk);
  const depth2 = await waitFor(() => anon2.market.find((m) => m.channel === "depth" && JSON.stringify(m.data).includes('"101"')));
  check("H gw2 anonymous client also received depth", !!depth2);
  const open = await http("GET", "/api/v1/order?status=open", U.alice);
  check("A open-orders API lists it", open.body?.data?.some((o: any) => o.orderId === a1Id) === true);

  // ── Scenario B: full match ──
  const b1 = await order(U.alice, "SELL", "100", "0.2");
  await waitFor(() => alice.priv.find((m) => m.type === "order.opened" && m.data.orderId === b1.body?.data?.order?.orderId));
  const b2 = await order(U.bob, "BUY", "100", "0.2");
  const b1Id = b1.body.data.order.orderId;
  const b2Id = b2.body.data.order.orderId;
  const bobFilled = await waitFor(() => bob.priv.find((m) => m.type === "order.filled" && m.data.orderId === b2Id));
  const aliceFilled = await waitFor(() => alice.priv.find((m) => m.type === "order.filled" && m.data.orderId === b1Id));
  check("B both sides received order.filled on their own gateway", !!bobFilled && !!aliceFilled);
  await waitFor(async () => ((await orderRow(b2Id)).startsWith("FILLED") ? true : undefined));
  check("B orders FILLED in DB", (await orderRow(b1Id)) === "FILLED:0.2/0" && (await orderRow(b2Id)) === "FILLED:0.2/0");
  const execs = await prisma.trade.findMany({ where: { orderId: { in: [b1Id, b2Id] } } });
  check("B trade persisted exactly once (2 rows, 1 execution)", execs.length === 2 && new Set(execs.map((t) => t.executionId)).size === 1);
  // bob: 5000 − (20 + 0.02 taker fee) ; alice: +20 − 0.02 maker fee
  check("B wallet settlement with fees", (await wallet(U.bob, A.USDC)).available === "4979.98" && (await wallet(U.alice, A.USDC)).available === "119.98",
    `bob ${JSON.stringify(await wallet(U.bob, A.USDC))} alice ${JSON.stringify(await wallet(U.alice, A.USDC))}`);
  const pubTrade = await waitFor(() => anon1.market.find((m) => m.channel === "trades" && m.type === "update" && m.data.price === "100"));
  check("B public trade update (anonymous)", !!pubTrade && pubTrade.data.side === "BUY" && !JSON.stringify(pubTrade).includes(U.bob));
  const pubTicker = await waitFor(() => anon1.market.find((m) => m.channel === "ticker" && m.type === "update" && m.data.lastPrice === "100"), 3000);
  check("B public ticker update", !!pubTicker);
  const pubCandle = await waitFor(() => anon1.market.find((m) => m.channel === "candles" && m.type === "update" && m.data.close === "100"));
  check("B public 1m candle update", !!pubCandle);

  // ── Scenario C: multiple partial fills against alice's resting 101 ask ──
  const statuses: string[] = [];
  for (const q of ["0.3", "0.3", "0.4"]) {
    const r = await order(U.bob, "BUY", "101", q);
    await waitFor(() => bob.priv.find((m) => m.type === "order.filled" && m.data.orderId === r.body?.data?.order?.orderId));
    await sleep(300);
    statuses.push(await orderRow(a1Id));
  }
  check("C maker statuses after each fill", JSON.stringify(statuses) === JSON.stringify(["PARTIALLY_FILLED:0.3/0.7", "PARTIALLY_FILLED:0.6/0.4", "FILLED:1/0"]), statuses.join(" → "));
  const partials = alice.priv.filter((m) => m.type === "order.partially_filled" && m.data.orderId === a1Id).length;
  const fills = alice.priv.filter((m) => m.type === "order.filled" && m.data.orderId === a1Id).length;
  check("C private lifecycle: 2× partially_filled then 1× filled", partials === 2 && fills === 1, `partials ${partials}, filled ${fills}`);
  check("C alice BTC fully consumed, nothing left locked", JSON.stringify(await wallet(U.alice, A.BTC)) === JSON.stringify({ available: "3.8", locked: "0" }));

  // ── Scenario D: partial fill then cancel ──
  const bobBefore = await wallet(U.bob, A.USDC);
  const d1 = await order(U.bob, "BUY", "99", "1"); // reserves 99.099
  const d1Id = d1.body.data.order.orderId;
  await waitFor(() => bob.priv.find((m) => m.type === "order.opened" && m.data.orderId === d1Id));
  await order(U.alice, "SELL", "99", "0.4");
  await waitFor(() => bob.priv.find((m) => m.type === "order.partially_filled" && m.data.orderId === d1Id));
  const cancel = await http("DELETE", `/api/v1/order/${d1Id}`, U.bob);
  check("D cancel accepted", cancel.status === 202, `${cancel.status}`);
  const cancelled = await waitFor(() => bob.priv.find((m) => m.type === "order.cancelled" && m.data.orderId === d1Id));
  check("D cancellation keeps executed quantity", cancelled?.data.executedQuantity === "0.4" && cancelled?.data.remainingQuantity === "0.6");
  await waitFor(async () => ((await orderRow(d1Id)).startsWith("CANCELLED") ? true : undefined));
  check("D order CANCELLED with 0.4 filled", (await orderRow(d1Id)) === "CANCELLED:0.4/0.6");
  // bob (maker) paid 0.4 × 99 = 39.6 + 0.0396 fee; the rest of 99.099 released
  const bobAfter = await wallet(U.bob, A.USDC);
  check("D only the unfilled reservation released", bobAfter.locked === "0" && new Prisma.Decimal(bobBefore.available).sub(bobAfter.available).eq("39.6396"),
    `${bobBefore.available} → ${bobAfter.available}`);
  check("D cancelling again is refused", (await http("DELETE", `/api/v1/order/${d1Id}`, U.bob)).status === 409);

  // ── Validation & auth at the edge ──
  check("API rejects unauthenticated order", (await http("POST", "/api/v1/order", undefined, { symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", price: "1", quantity: "1" })).status === 401);
  check("API rejects insufficient balance", (await order(U.carol, "BUY", "100", "10")).status === 400);
  check("API rejects MARKET buy", (await http("POST", "/api/v1/order", U.bob, { symbol: "BTCUSDC", side: "BUY", orderType: "MARKET", quantity: "0.1" })).status === 400);
  check("API rejects bad tick size", (await order(U.bob, "BUY", "100.001", "0.2")).status === 400);

  // Resting order for the restart phase
  const g = await order(U.alice, "SELL", "105", "0.25");
  await waitFor(() => alice.priv.find((m) => m.type === "order.opened" && m.data.orderId === g.body?.data?.order?.orderId));
  console.log(`RESTING_ORDER=${g.body?.data?.order?.orderId}`);

  for (const c of [alice, bob, carol, anon1, anon2]) c.s.disconnect();
}

if (phase === "prepare-restart") {
  const alice = client(GW1, U.alice);
  await alice.ready;
  await sleep(300);
  const g = await order(U.alice, "SELL", process.env.PRICE ?? "105", "0.25");
  await waitFor(() => alice.priv.find((m) => m.type === "order.opened" && m.data.orderId === g.body?.data?.order?.orderId));
  check("G resting order placed before restart", !!g.body?.data?.order?.orderId);
  console.log(`RESTING_ORDER=${g.body?.data?.order?.orderId}`);
  alice.s.disconnect();
}

if (phase === "after-restart") {
  // ── Scenario G: engine, order-service and gw1 were restarted ──
  const anon = client(GW1);
  const bob = client(GW2, U.bob);
  await Promise.all([anon.ready, bob.ready]);
  await ask(anon.s, { action: "subscribe", channel: "depth", symbol: "BTCUSDC" });
  const price = process.env.PRICE ?? "105";
  const snap = await waitFor(() => anon.market.find((m) => m.channel === "depth" && m.type === "snapshot" && JSON.stringify(m.data).includes(`"${price}"`)));
  check("G resubscribed client gets a depth snapshot containing the pre-restart resting order", !!snap);

  const resting = process.env.RESTING_ORDER!;
  const r = await order(U.bob, "BUY", price, "0.25");
  const filled = await waitFor(() => bob.priv.find((m) => m.type === "order.filled" && m.data.orderId === r.body?.data?.order?.orderId), 15000);
  check("G recovered engine matched against the pre-restart resting order", !!filled && (await waitFor(async () => ((await orderRow(resting)) === "FILLED:0.25/0" ? true : undefined))) === true, await orderRow(resting));
  for (const c of [anon, bob]) c.s.disconnect();
}

if (phase === "final") {
  const users = Object.values(U);
  const discrepancies = await reconcileWallets(users);
  check("Ledger ↔ balances ↔ reservations reconcile for all users", discrepancies.length === 0, JSON.stringify(discrepancies));
  const executions = await prisma.trade.groupBy({ by: ["executionId"], _count: true, where: { userId: { in: users } } });
  check("Every execution persisted exactly twice (maker+taker), never duplicated", executions.every((e) => e._count === 2), `${executions.length} executions`);
  const marketTrades = await prisma.marketTrade.count({ where: { tradeId: { in: executions.map((e) => e.executionId) } } });
  check("Market-service recorded each execution once", marketTrades === executions.length, `${marketTrades} vs ${executions.length}`);
  const unpublished = await prisma.outboxEvent.count({ where: { publishedAt: null } });
  check("Outbox fully drained", unpublished === 0, `${unpublished} pending`);
  const stuck = await prisma.order.count({ where: { userId: { in: users }, status: "PENDING" } });
  check("No order stuck in PENDING", stuck === 0);
  const ticker: any = await (await fetch(`${API}/api/v1/market/markets/BTCUSDC/ticker`)).json();
  const latest = await prisma.marketTrade.findFirst({ where: { symbol: "BTCUSDC" }, orderBy: [{ executedAt: "desc" }, { tradeId: "desc" }] });
  const allTrades = await prisma.marketTrade.count({ where: { symbol: "BTCUSDC" } });
  check("Ticker reflects real executions (last price, 24h count)", ticker.data?.lastPrice === latest?.price.toFixed() && ticker.data?.tradeCount === allTrades,
    JSON.stringify({ last: ticker.data?.lastPrice, n: ticker.data?.tradeCount, db: allTrades }));
}

const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (${phase})`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
