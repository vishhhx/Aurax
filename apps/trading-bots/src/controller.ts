import * as p from "@clack/prompts";
import chalk from "chalk";
import { io } from "socket.io-client";
import { rmSync, writeFileSync } from "node:fs";
import { assertDevOnly, ENV, KILL_FILE, loadPlan, MAX_BOTS, PLAN_FILE, writeJson, type BotDef, type Plan } from "./lib/config";
import { AuraxHttp, type Market } from "./lib/http";
import { detectMode, launch, running, stop, stopAll } from "./lib/launcher";
import { buildPlan, type MarketAllocation } from "./lib/plan";
import { fmt } from "./lib/precision";
import { seed } from "./seed";

assertDevOnly();
const pub = new AuraxHttp();
const asBot = (b: BotDef) => new AuraxHttp({ userId: b.userId!, email: b.email!, name: b.name });
const bail = <T>(v: T): Exclude<T, symbol> => {
  if (p.isCancel(v)) throw new Error("cancelled");
  return v as Exclude<T, symbol>;
};
const ok = (b: boolean, label = "Connected") => (b ? chalk.green(`● ${label}`) : chalk.red("● Unavailable"));

async function checkWs(): Promise<string | null> {
  return new Promise((resolve) => {
    const s = io(ENV.WS_URL, { transports: ["websocket"], reconnection: false, timeout: 3000 });
    s.on("connect", () => (s.close(), resolve(null)));
    s.on("connect_error", (e) => (s.close(), resolve(e.message)));
  });
}

async function status(): Promise<Market[]> {
  const [api, markets, ws] = await Promise.all([
    pub.health().catch(() => false),
    pub.markets().catch((e: Error) => e),
    checkWs(),
  ]);
  const db = await import("@repo/pg").then(({ prisma }) => prisma.$queryRaw`SELECT 1`.then(() => null, (e: Error) => e.message));
  const list = markets instanceof Error ? [] : markets;
  const lines = [
    `API Gateway   ${ok(api)}  ${chalk.gray(ENV.API_URL)}`,
    `Market data   ${markets instanceof Error ? chalk.red(`● ${markets.message}`) : ok(true, `${list.length} markets`)}`,
    `WebSocket     ${ws ? chalk.red(`● ${ws}`) : ok(true)}  ${chalk.gray(ENV.WS_URL)}`,
    `Database      ${db ? chalk.red(`● ${db}`) : ok(true, "Ready")}`,
    `Dev auth      ${ENV.DEV_JWT_SECRET ? ok(true, "Configured") : chalk.red("● AURAX_DEV_JWT_SECRET missing")}`,
    `Launch mode   ${chalk.cyan(Object.values(detectMode()).join(" · "))}   ${chalk.gray(`max ${MAX_BOTS} bots`)}`,
    "",
    chalk.bold("Markets  ") + (list.map((m) => `${chalk.cyan(m.symbol)} ${chalk.gray(`${m.baseAsset}/${m.quoteAsset}`)}`).join("   ") || chalk.red("none")),
  ];
  p.note(lines.join("\n"), "Backend");
  return list;
}

const intIn = (min: number, max: number) => (v: string | undefined) => (/^\d+$/.test(v ?? "") && +v! >= min && +v! <= max ? undefined : `enter an integer ${min}–${max}`);
const decimal = (v: string | undefined) => (/^\d+(\.\d+)?$/.test(v ?? "") ? undefined : "enter a non-negative decimal");

async function configure(markets: Market[]): Promise<void> {
  if (!markets.length) return void p.log.error("No markets available from the backend.");
  if (running().length) return void p.log.warn("Stop running bots before reconfiguring.");
  const total = Number(bail(await p.text({ message: `How many bots? (1–${MAX_BOTS})`, initialValue: "4", validate: intIn(1, MAX_BOTS) })));
  const chosen = bail(await p.multiselect({ message: "Which markets?", options: markets.map((m) => ({ value: m.symbol, label: m.symbol, hint: `tick ${m.tickSize} · min notional ${m.minNotional}` })), required: true }));

  const allocations: MarketAllocation[] = [];
  let left = total;
  for (const [idx, sym] of chosen.entries()) {
    const m = markets.find((x) => x.symbol === sym)!;
    const last = idx === chosen.length - 1;
    const n = last ? left : Number(bail(await p.text({ message: `${sym}: how many bots? (${left} left)`, initialValue: String(Math.max(1, Math.floor(left / (chosen.length - idx)))), validate: intIn(1, left - (chosen.length - idx - 1)) })));
    if (last) p.log.info(`${sym}: ${n} bot(s)`);
    left -= n;
    const maker = Number(bail(await p.text({ message: `${sym}: maker bots (of ${n})`, initialValue: String(Math.ceil(n / 2)), validate: intIn(0, n) })));
    const taker = Number(bail(await p.text({ message: `${sym}: taker bots (of ${n - maker})`, initialValue: String(Math.min(n - maker, Math.max(0, n - maker - 1) || n - maker)), validate: intIn(0, n - maker) })));
    const liquidity = n - maker - taker;
    p.log.info(`${sym}: ${maker} maker · ${taker} taker · ${liquidity} liquidity`);
    const quote = bail(await p.text({ message: `${sym}: ${m.quoteAsset} budget for this market`, initialValue: "10000", validate: decimal }));
    const base = bail(await p.text({ message: `${sym}: ${m.baseAsset} budget for this market`, initialValue: "0.5", validate: decimal }));
    const book = await pub.orderbook(sym, 1).catch(() => null);
    const tick = await pub.ticker(sym).catch(() => null);
    let anchorPrice: string | undefined;
    if (!book?.bids.length && !book?.asks.length && !tick?.lastPrice) {
      p.log.warn(`${sym} has no order book and no trades: makers cannot derive a price.`);
      const a = bail(await p.text({ message: `${sym}: operator anchor price in ${m.quoteAsset} (blank = makers wait)`, placeholder: "e.g. 65000", validate: (v) => (!v ? undefined : decimal(v)) }));
      anchorPrice = a || undefined;
    }
    allocations.push({ symbol: sym, roles: { maker, taker, liquidity }, budget: { base, quote }, anchorPrice, limits: {} });
  }

  const maxOrderNotional = Number(bail(await p.text({ message: "Max notional per order (quote)", initialValue: "200", validate: decimal })));
  const maxSessionNotional = Number(bail(await p.text({ message: "Max session notional per bot (quote)", initialValue: "25000", validate: decimal })));
  const cooldownMs = Number(bail(await p.text({ message: "Cooldown between submissions (ms)", initialValue: "1000", validate: intIn(250, 600000) })));
  const spreadBps = Number(bail(await p.text({ message: "Maker spread from reference (bps)", initialValue: "4", validate: intIn(1, 5000) })));
  const live = bail(await p.confirm({ message: "Submit REAL orders to the local Aurax backend? (No = dry-run)", initialValue: false }));
  for (const a of allocations) a.limits = { maxOrderNotional, maxSessionNotional, cooldownMs, spreadBps, dryRun: !live };

  let plan: Plan;
  try {
    plan = buildPlan(total, allocations, markets);
  } catch (e) {
    return void p.log.error((e as Error).message);
  }
  p.note(plan.bots.map((b) => `${chalk.bold(b.name.padEnd(22))} ${b.budget.base} ${b.baseAsset} · ${b.budget.quote} ${b.quoteAsset}${b.anchorPrice ? chalk.gray(` · anchor ${b.anchorPrice}`) : ""}`).join("\n"), `Plan · ${live ? chalk.red("LIVE") : chalk.yellow("DRY-RUN")}`);
  if (!bail(await p.confirm({ message: "Provision & fund these dev bots?" }))) return;

  const sp = p.spinner();
  sp.start("Seeding bot users and dev funding");
  const results = await seed(plan);
  writeJson(PLAN_FILE, plan);
  sp.stop("Seed complete");
  for (const r of results) r.ok ? p.log.success(`${r.bot} ${r.created ? "created" : "exists"} · funded ${r.funded.join(", ") || "nothing (already at budget)"}`) : p.log.error(`${r.bot}: ${r.error}`);

  const verified = await verifyBalances(plan);
  if (bail(await p.confirm({ message: `Start ${verified.length} bot(s) now?`, initialValue: false }))) start(verified);
}

/** Wallet Service is authoritative: bots whose balances do not cover their budget are not started. */
async function verifyBalances(plan: Plan): Promise<BotDef[]> {
  const okBots: BotDef[] = [];
  const rows: string[] = [];
  for (const b of plan.bots) {
    if (!b.userId) { rows.push(chalk.red(`✗ ${b.name}: not provisioned`)); continue; }
    try {
      const bal = await asBot(b).balances();
      const total = (s: string) => { const x = bal.find((y) => y.symbol === s); return x ? Number(x.availableBalance) + Number(x.lockedBalance) : 0; };
      const enough = total(b.baseAsset) >= Number(b.budget.base) && total(b.quoteAsset) >= Number(b.budget.quote);
      rows.push(`${enough ? chalk.green("✓") : chalk.red("✗")} ${b.name.padEnd(22)} ${fmt(total(b.baseAsset), 6)} ${b.baseAsset} · ${fmt(total(b.quoteAsset), 2)} ${b.quoteAsset}${enough ? "" : chalk.red("  below budget")}`);
      if (enough) okBots.push(b);
    } catch (e) {
      rows.push(chalk.red(`✗ ${b.name}: ${(e as Error).message}`));
    }
  }
  p.note(rows.join("\n"), "Balances (Wallet Service)");
  return okBots;
}

function start(bots: BotDef[]): void {
  rmSync(KILL_FILE, { force: true });
  const live = new Set(running().map((r) => r.id));
  for (const b of bots) {
    if (live.has(b.id)) { p.log.warn(`${b.name} already running`); continue; }
    p.log.step(`${b.name} → ${launch(b.id, b.name)}`);
  }
}

function showRunning(): void {
  const plan = loadPlan();
  const rs = running();
  if (!plan?.bots.length) return void p.log.info("No bots configured.");
  const rows = plan.bots.map((b) => {
    const r = rs.find((x) => x.id === b.id);
    if (!r) return `${chalk.gray("○")} ${b.name.padEnd(22)} ${chalk.gray("stopped")}`;
    const stale = Date.now() - r.heartbeat > 5000;
    return `${stale ? chalk.yellow("◐") : chalk.green("●")} ${b.name.padEnd(22)} pid ${String(r.pid).padEnd(7)} ${r.status.padEnd(13)} ws ${r.ws ? "up" : chalk.red("down")} · book ${r.book} · open ${r.open} · ${fmt(r.sessionNotional)} ${b.quoteAsset}${r.lastError ? chalk.red(`\n    last error: ${r.lastError.slice(0, 90)}`) : ""}`;
  });
  p.note(rows.join("\n"), "Bots");
}

async function pickBot(onlyRunning = false): Promise<BotDef | null> {
  const plan = loadPlan();
  const ids = new Set(running().map((r) => r.id));
  const bots = (plan?.bots ?? []).filter((b) => !onlyRunning || ids.has(b.id));
  if (!bots.length) return p.log.info(onlyRunning ? "No running bots." : "No bots configured."), null;
  const id = bail(await p.select({ message: "Which bot?", options: bots.map((b) => ({ value: b.id, label: b.name, hint: ids.has(b.id) ? "running" : "stopped" })) }));
  return bots.find((b) => b.id === id)!;
}

async function viewBook(markets: Market[]): Promise<void> {
  const sym = bail(await p.select({ message: "Market", options: markets.map((m) => ({ value: m.symbol, label: m.symbol })) }));
  const ob = await pub.orderbook(sym, 10);
  const m = markets.find((x) => x.symbol === sym)!;
  const asks = [...ob.asks].reverse().map((l) => chalk.red(`${fmt(l.price, m.pricePrecision).padStart(14)}  ${l.quantity}`));
  const bids = ob.bids.map((l) => chalk.green(`${fmt(l.price, m.pricePrecision).padStart(14)}  ${l.quantity}`));
  p.note([...(asks.length ? asks : [chalk.gray("  (no asks)")]), chalk.gray("  ────────────── seq " + ob.sequenceNumber), ...(bids.length ? bids : [chalk.gray("  (no bids)")])].join("\n"), `${sym} order book (REST)`);
}

async function viewBalances(): Promise<void> {
  const plan = loadPlan();
  const rows: string[] = [];
  for (const b of plan?.bots.filter((x) => x.userId) ?? []) {
    const bal = await asBot(b).balances().catch((e: Error) => e);
    if (bal instanceof Error) { rows.push(chalk.red(`${b.name}: ${bal.message}`)); continue; }
    const f = (s: string) => { const x = bal.find((y) => y.symbol === s); return `${x?.availableBalance ?? 0} ${chalk.gray(`(${x?.lockedBalance ?? 0} locked)`)} ${s}`; };
    rows.push(`${chalk.bold(b.name.padEnd(22))} ${f(b.baseAsset)}  ·  ${f(b.quoteAsset)}`);
  }
  p.note(rows.join("\n") || "No provisioned bots.", "Balances (Wallet Service)");
}

async function viewOrders(): Promise<void> {
  const b = await pickBot();
  if (!b?.userId) return;
  const c = asBot(b);
  const [orders, trades] = await Promise.all([c.orders(b.symbol, 10), c.trades(b.symbol, 10)]);
  const o = orders.map((x) => `${x.side === "BUY" ? chalk.green("BUY ") : chalk.red("SELL")} ${String(x.price ?? "MKT").padStart(12)} × ${x.quantity.padEnd(10)} filled ${x.executedQuantity.padEnd(10)} ${x.status}`);
  const t = trades.map((x) => `${x.side === "BUY" ? chalk.green("BUY ") : chalk.red("SELL")} ${String(x.price).padStart(12)} × ${x.quantity}  ${new Date(Number(x.executedAt) || String(x.executedAt)).toLocaleTimeString("en-GB")}`);
  p.note([chalk.bold("Orders"), ...(o.length ? o : ["  none"]), "", chalk.bold("Trades"), ...(t.length ? t : ["  none"])].join("\n"), b.name);
}

async function shutdownAll(): Promise<void> {
  const n = running().length;
  if (!n) return;
  writeFileSync(KILL_FILE, new Date().toISOString());
  const sp = p.spinner();
  sp.start(`Stopping ${n} bot(s) and cancelling their orders`);
  await stopAll();
  rmSync(KILL_FILE, { force: true });
  sp.stop(`Stopped ${n} bot(s)`);
}

async function main(): Promise<void> {
  console.clear();
  p.intro(chalk.bgHex("#7c3aed").white.bold("  AURAX BOT LAB  ") + chalk.gray("  dev-only integration harness"));
  let markets = await status();
  for (;;) {
    const choice = await p.select({
      message: "Select an option",
      options: [
        { value: "config", label: "Configure and start bots" },
        { value: "start", label: "Start configured bots", hint: loadPlan() ? `${loadPlan()!.bots.length} configured` : "none" },
        { value: "list", label: "View running bots", hint: `${running().length} running` },
        { value: "stop", label: "Stop a bot" },
        { value: "stopall", label: "Stop all bots (kill switch)" },
        { value: "book", label: "View market order book" },
        { value: "bal", label: "View bot balances" },
        { value: "orders", label: "View open orders and recent trades" },
        { value: "refresh", label: "Re-check backend" },
        { value: "exit", label: "Exit", hint: "stops all bots" },
      ],
    });
    if (p.isCancel(choice) || choice === "exit") break;
    try {
      if (choice === "config") await configure(markets);
      else if (choice === "start") { const plan = loadPlan(); if (plan) start(await verifyBalances(plan)); }
      else if (choice === "list") showRunning();
      else if (choice === "stop") { const b = await pickBot(true); if (b) p.log.success((await stop(b.id)) ? `${b.name} stopped` : `${b.name} was not running`); }
      else if (choice === "stopall") await shutdownAll();
      else if (choice === "book") await viewBook(markets);
      else if (choice === "bal") await viewBalances();
      else if (choice === "orders") await viewOrders();
      else if (choice === "refresh") markets = await status();
    } catch (e) {
      p.log.error((e as Error).message);
    }
  }
  await shutdownAll();
  p.outro("Bye — no bots left running.");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => void shutdownAll().then(() => process.exit(0)));
await main();
