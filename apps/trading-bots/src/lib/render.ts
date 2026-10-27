import chalk from "chalk";
import type { BotDef } from "./config";
import type { Order, Trade } from "./http";
import { fmt } from "./precision";
import type { CandleSeries, OrderBook } from "./market-state";

const W = 74;
const line = (c = "─") => chalk.gray(c.repeat(W));
const pad = (s: string, n: number, right = false) => {
  const len = s.replace(/\x1b\[[0-9;]*m/g, "").length;
  return right ? " ".repeat(Math.max(0, n - len)) + s : s + " ".repeat(Math.max(0, n - len));
};
const time = (ms: number) => (ms ? new Date(ms).toLocaleTimeString("en-GB") : "—");
const ROLE_COLOR = { maker: chalk.cyan, taker: chalk.magenta, liquidity: chalk.yellow } as const;

export interface View {
  bot: BotDef;
  book: OrderBook;
  candles: CandleSeries;
  wsConnected: boolean;
  authed: boolean;
  trading: string;
  note: string;
  open: Order[];
  fills: Trade[];
  balances: { base: string; quote: string; baseLocked: string; quoteLocked: string };
  sessionNotional: number;
  log: string[];
  pricePrecision: number;
  qtyPrecision: number;
}

export function render(v: View): string {
  const { bot, book } = v;
  const pp = v.pricePrecision, qp = Math.min(v.qtyPrecision, 6);
  const out: string[] = [];
  const role = ROLE_COLOR[bot.role](bot.role.toUpperCase());
  out.push(chalk.bold.bgHex("#1e1e2e").white(pad(` ◆ ${bot.name}   ${chalk.gray("market")} ${bot.symbol}   ${chalk.gray("role")} ${role}`, W)));

  const ws = v.wsConnected ? chalk.green("● connected") : chalk.red("● disconnected");
  const bs = { synced: chalk.green("synced"), awaiting_snapshot: chalk.yellow("awaiting snapshot"), unsynced: chalk.red("UNSYNCED · resyncing"), disconnected: chalk.red("stale (disconnected)") }[book.status];
  const mode = bot.limits.dryRun ? chalk.bgYellow.black(" DRY-RUN ") : chalk.bgRed.white(" LIVE ");
  out.push(` WS ${ws}  ${chalk.gray(v.authed ? "(private ✓)" : "(public)")}   Book ${bs}   ${mode}`);
  out.push(` Trading ${chalk.bold(v.trading)}  ${chalk.gray("·")} ${chalk.italic(v.note)}`);

  const bb = book.bestBid(), ba = book.bestAsk();
  const spread = bb && ba ? Number(ba.price) - Number(bb.price) : null;
  out.push(
    ` ${chalk.gray("Bid")} ${chalk.green.bold(fmt(bb?.price, pp))}   ${chalk.gray("Ask")} ${chalk.red.bold(fmt(ba?.price, pp))}   ${chalk.gray("Spread")} ${fmt(spread, pp)}   ${chalk.gray("Seq")} ${book.seq ?? "—"}   ${chalk.gray("Upd")} ${time(book.updatedAt)}`,
  );
  out.push(line());

  // Order book: bids | asks side by side with cumulative depth bars
  const N = 8;
  const bids = book.usable ? book.levels("bids", N) : [];
  const asks = book.usable ? book.levels("asks", N) : [];
  const maxQ = Math.max(1e-12, ...[...bids, ...asks].map((l) => Number(l.quantity)));
  const mine = new Set(v.open.map((o) => `${o.side}:${Number(o.price)}`));
  out.push(chalk.gray(`  ${pad("BID QTY", 12, true)} ${pad("BID", 13, true)} │ ${pad("ASK", 13)} ${pad("ASK QTY", 12)}`));
  const bookStart = out.length;
  if (!book.usable) out.push(chalk.yellow(`  ${book.status === "disconnected" ? "Not showing stale depth — WebSocket disconnected" : "Waiting for a consistent snapshot…"}`));
  else if (!bids.length && !asks.length) out.push(chalk.gray("  (order book is empty)"));
  for (let k = 0; k < N && book.usable && (bids[k] || asks[k]); k++) {
    const b = bids[k], a = asks[k];
    const bar = (q?: string) => "▇".repeat(q ? Math.max(1, Math.round((Number(q) / maxQ) * 6)) : 0);
    const bm = b && mine.has(`BUY:${Number(b.price)}`) ? chalk.cyan("◂") : " ";
    const am = a && mine.has(`SELL:${Number(a.price)}`) ? chalk.cyan("▸") : " ";
    out.push(
      `${chalk.green.dim(pad(bar(b?.quantity), 6, true))}${pad(b ? fmt(b.quantity, qp) : "", 8, true)} ${chalk.green(pad(b ? fmt(b.price, pp) : "", 13, true))}${bm}│${am}${chalk.red(pad(a ? fmt(a.price, pp) : "", 13))} ${pad(a ? fmt(a.quantity, qp) : "", 8)}${chalk.red.dim(bar(a?.quantity))}`,
    );
  }
  while (out.length < bookStart + N) out.push("");
  out.push(line());

  // Candles
  const cs = v.candles.list().slice(-5);
  const candleStart = out.length;
  out.push(chalk.bold(` CANDLES ${v.candles.interval}`) + chalk.gray(`  source: ${v.candles.source === "none" ? "no data from market service yet" : v.candles.source}`));
  if (!cs.length) out.push(chalk.gray("  (no candles reported by the backend)"));
  else out.push(chalk.gray(`  ${pad("Time", 7)}${pad("Open", 12, true)}${pad("High", 12, true)}${pad("Low", 12, true)}${pad("Close", 12, true)}${pad("Vol", 11, true)}`));
  for (const c of cs) {
    const up = Number(c.close) >= Number(c.open);
    const col = up ? chalk.green : chalk.red;
    const t = new Date(c.openTime).toLocaleTimeString("en-GB").slice(0, 5);
    out.push(`  ${pad(t, 7)}${pad(fmt(c.open, pp), 12, true)}${pad(fmt(c.high, pp), 12, true)}${pad(fmt(c.low, pp), 12, true)}${col(pad(fmt(c.close, pp), 12, true))}${pad(fmt(c.baseVolume, 4), 11, true)} ${c.isClosed ? chalk.gray("closed") : chalk.yellow("live")}`);
  }
  while (out.length < candleStart + 7) out.push("");
  out.push(line());

  // Account
  const b = v.balances;
  out.push(
    ` ${chalk.gray(bot.baseAsset)} ${fmt(b.base, 6)} ${chalk.gray(`(+${fmt(b.baseLocked, 6)} locked)`)}   ${chalk.gray(bot.quoteAsset)} ${fmt(b.quote, 2)} ${chalk.gray(`(+${fmt(b.quoteLocked, 2)} locked)`)}   ${chalk.gray("session")} ${fmt(v.sessionNotional, 2)}/${fmt(bot.limits.maxSessionNotional, 0)}`,
  );
  out.push(chalk.bold(` OPEN ORDERS (${v.open.length})`));
  const ordersStart = out.length;
  for (const o of v.open.slice(0, 4)) {
    out.push(`  ${o.side === "BUY" ? chalk.green("BUY ") : chalk.red("SELL")} ${pad(fmt(o.price, pp), 12, true)} × ${pad(o.remainingQuantity, 10)} ${chalk.gray(o.status)} ${chalk.gray(o.orderId.slice(-8))}`);
  }
  while (out.length < ordersStart + 4) out.push("");
  out.push(chalk.bold(" RECENT FILLS"));
  const fillsStart = out.length;
  {
    for (const t of v.fills.slice(0, 3)) out.push(`  ${t.side === "BUY" ? chalk.green("BUY ") : chalk.red("SELL")} ${pad(fmt(t.price, pp), 12, true)} × ${t.quantity}  ${chalk.gray(time(Number(t.executedAt) || Date.parse(String(t.executedAt))))}`);
  }
  while (out.length < fillsStart + 3) out.push("");
  out.push(line());
  const logs = v.log.slice(-5);
  while (logs.length < 5) logs.unshift("");
  for (const l of logs) out.push(chalk.gray(" " + l.slice(0, W - 1)));
  out.push(chalk.gray(" Ctrl+C to stop this bot (cancels its open orders)"));
  return out.join("\n");
}
