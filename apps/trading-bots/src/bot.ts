import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assertDevOnly, killed, loadPlan, LOG_DIR, RUN_DIR, writeJson } from "./lib/config";
import { AuraxHttp, HttpError, type Order, type OrderInput, type Trade } from "./lib/http";
import { CandleSeries, OrderBook } from "./lib/market-state";
import { render } from "./lib/render";
import { Screen } from "./lib/screen";
import { MarketFeed } from "./lib/ws";
import { planFor } from "./strategies";
import { cancelAllOpen } from "./cancel-all";

assertDevOnly();
const botId = process.argv[2];
const bot = loadPlan()?.bots.find((b) => b.id === botId);
if (!bot) throw new Error(`unknown bot ${botId}; configure it from the controller first`);
if (!bot.userId || !bot.email) throw new Error(`${bot.name} is not provisioned; run the seed step`);

const logFile = join(LOG_DIR, `${bot.id}.log`);
const runFile = join(RUN_DIR, `${bot.id}.json`);
const logs: string[] = [];
const log = (msg: string) => {
  const l = `${new Date().toLocaleTimeString("en-GB")} ${msg}`;
  logs.push(l);
  if (logs.length > 50) logs.shift();
  appendFileSync(logFile, l + "\n");
};
let lastError = "";
const fail = (msg: string) => {
  lastError = msg;
  log(`ERROR ${msg}`);
};

const http = new AuraxHttp({ userId: bot.userId, email: bot.email, name: bot.name }, (m) => appendFileSync(logFile, `  http ${m}\n`));
const book = new OrderBook();
const candles = new CandleSeries("1m");
let lastPrice: number | null = null;
let authed = false;
let reconcileSoon = true;

const feed = new MarketFeed(bot.symbol, book, candles, () => http.accessToken(), {
  onTicker: (p) => (lastPrice = p ? Number(p) : null),
  onUserEvent: () => (reconcileSoon = true),
  onError: fail,
  onSession: (s) => {
    authed = s.authenticated;
    if (!s.authenticated && s.reason) log(`ws private channel unavailable: ${s.reason}`);
  },
});

// State. Orders and balances are always re-read from the backend; nothing local is authoritative.
let open: Order[] = [];
let fills: Trade[] = [];
const bal = { base: "0", quote: "0", baseLocked: "0", quoteLocked: "0" };
let sessionNotional = 0;
let lastSubmitAt = 0;
let trading = bot.limits.dryRun ? "dry-run" : "starting";
let note = "reconciling with backend…";
let halted = false;
/** An order whose POST outcome is unknown (timeout/5xx). Blocks new submissions until it is found or ages out. */
let ambiguous: { input: OrderInput; at: number } | null = null;

const market = (await http.markets()).find((m) => m.symbol === bot.symbol);
if (!market) throw new Error(`market ${bot.symbol} not found on backend`);
http.candles(bot.symbol, "1m", 8).then((cs) => cs.forEach((c) => candles.upsert(c, "rest")), (e) => log(`candle history unavailable: ${e.message}`));

async function reconcile(): Promise<void> {
  const [orders, balances] = await Promise.all([http.openOrders(bot!.symbol), http.balances()]);
  open = orders;
  const b = balances.find((x) => x.symbol === bot!.baseAsset), q = balances.find((x) => x.symbol === bot!.quoteAsset);
  Object.assign(bal, { base: b?.availableBalance ?? "0", baseLocked: b?.lockedBalance ?? "0", quote: q?.availableBalance ?? "0", quoteLocked: q?.lockedBalance ?? "0" });
  if (ambiguous) {
    const recent = await http.orders(bot!.symbol, 20);
    const a = ambiguous;
    const hit = recent.find((o) => o.side === a.input.side && Number(o.quantity) === Number(a.input.quantity) && Number(o.price) === Number(a.input.price) && Date.parse(o.createdAt) >= a.at - 5000);
    if (hit) log(`ambiguous submit resolved: found ${hit.orderId.slice(-8)} ${hit.status}`);
    if (hit || Date.now() - a.at > 30_000) ambiguous = null;
  }
}

/** Visible quantity within the taker's slippage band on each side. */
function bandDepth(): { depthBidQty?: number; depthAskQty?: number } {
  const bb = Number(book.bestBid()?.price), ba = Number(book.bestAsk()?.price);
  const slip = bot!.limits.takerSlippageBps * 1e-4;
  const sum = (side: "bids" | "asks", ok: (p: number) => boolean) => book.levels(side, 50).filter((l) => ok(Number(l.price))).reduce((n, l) => n + Number(l.quantity), 0);
  return {
    depthBidQty: bb ? sum("bids", (p) => p >= bb * (1 - slip)) : undefined,
    depthAskQty: ba ? sum("asks", (p) => p <= ba * (1 + slip)) : undefined,
  };
}

async function execute(): Promise<void> {
  const p = planFor({
    bot: bot!,
    market: market!,
    bestBid: Number(book.bestBid()?.price) || undefined,
    bestAsk: Number(book.bestAsk()?.price) || undefined,
    bestBidQty: Number(book.bestBid()?.quantity) || undefined,
    bestAskQty: Number(book.bestAsk()?.quantity) || undefined,
    ...bandDepth(),
    lastPrice,
    open,
    available: { base: Number(bal.base), quote: Number(bal.quote) },
    holdingsBase: Number(bal.base) + Number(bal.baseLocked),
    sessionNotional,
  });
  note = p.note;
  if (!p.cancels.length && !p.places.length) return;
  lastSubmitAt = Date.now();
  for (const id of p.cancels) {
    if (bot!.limits.dryRun) { log(`[dry] cancel ${id.slice(-8)}`); continue; }
    await http.cancel(id).then(() => log(`cancel ${id.slice(-8)}`), (e) => fail(`cancel ${id.slice(-8)}: ${e.message}`));
  }
  for (const o of p.places) {
    const desc = `${o.side} ${o.quantity} @ ${o.price} ${o.timeInForce}${o.postOnly ? " post-only" : ""}`;
    if (bot!.limits.dryRun) { log(`[dry] place ${desc}`); continue; }
    try {
      sessionNotional += Number(o.quantity) * Number(o.price);
      const placed = await http.place(o);
      log(`placed ${desc} → ${placed.orderId.slice(-8)} ${placed.status}`);
    } catch (e) {
      const err = e as HttpError;
      if (err.ambiguous) { ambiguous = { input: o, at: lastSubmitAt }; fail(`submit outcome unknown (${err.message}); reconciling, not retrying`); break; }
      sessionNotional -= Number(o.quantity) * Number(o.price);
      if (err.status === 429) { lastSubmitAt = Date.now() + 5000; fail("rate limited by gateway; backing off 5s"); break; }
      fail(`rejected ${desc}: ${err.message}`);
    }
  }
  reconcileSoon = true;
}

let busy = false;
let tickN = 0;
async function tick(): Promise<void> {
  if (busy || halted) return;
  busy = true;
  try {
    tickN++;
    if (killed()) return void (await shutdown("global kill switch"));
    if (reconcileSoon || tickN % 2 === 0) { reconcileSoon = false; await reconcile(); }
    if (tickN % 5 === 1) fills = await http.trades(bot!.symbol, 5).catch(() => fills);
    if (!feed.connected || !book.usable) { trading = "paused"; note = feed.connected ? "waiting for consistent order book" : "WebSocket down: not trading on stale data"; return; }
    if (ambiguous) { trading = "paused"; note = "reconciling ambiguous submission"; return; }
    trading = bot!.limits.dryRun ? "dry-run" : "active";
    if (sessionNotional >= bot!.limits.maxSessionNotional) { trading = "limit reached"; note = "session budget exhausted"; return; }
    if (Date.now() - lastSubmitAt >= bot!.limits.cooldownMs) await execute();
  } catch (e) {
    fail((e as Error).message);
  } finally {
    busy = false;
    writeJson(runFile, { pid: process.pid, id: bot!.id, status: halted ? "stopped" : trading, ws: feed.connected, book: book.status, open: open.length, sessionNotional, lastError, heartbeat: Date.now() });
  }
}

async function shutdown(reason: string): Promise<void> {
  if (halted) return;
  halted = true;
  trading = "stopping";
  log(`shutting down: ${reason}`);
  if (bot!.limits.cancelOnExit && !bot!.limits.dryRun) {
    const n = await cancelAllOpen(http, bot!.symbol, log);
    log(`cancelled ${n} open order(s)`);
  }
  feed.close();
  screen.close();
  rmSync(runFile, { force: true });
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => void shutdown(sig));
log(`started pid ${process.pid} (${bot.limits.dryRun ? "dry-run" : "LIVE"})`);
setInterval(tick, Math.min(1000, Math.max(250, bot.limits.cooldownMs / 2)));
const screen = new Screen();
setInterval(() => {
  screen.draw(render({ bot: bot!, book, candles, wsConnected: feed.connected, authed, trading, note, open, fills, balances: bal, sessionNotional, log: logs, pricePrecision: market!.pricePrecision, qtyPrecision: market!.quantityPrecision }));
}, 250);
