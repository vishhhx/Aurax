import type { BotDef } from "../lib/config";
import type { Market, Order, OrderInput } from "../lib/http";
import { roundToStep } from "../lib/precision";

export interface StrategyInput {
  bot: BotDef;
  market: Market;
  bestBid?: number;
  bestAsk?: number;
  bestBidQty?: number;
  bestAskQty?: number;
  /** Quantity resting within the taker's slippage band, per side. */
  depthBidQty?: number;
  depthAskQty?: number;
  lastPrice?: number | null;
  open: Order[]; // authoritative, from GET /order?status=open
  available: { base: number; quote: number };
  holdingsBase: number; // available + locked base
  sessionNotional: number;
}

export interface Plan {
  cancels: string[];
  places: OrderInput[];
  note: string;
}

const idle = (note: string): Plan => ({ cancels: [], places: [], note });

/** Reference price: live mid, else last trade, else the operator's explicit anchor. Never invented. */
export function referencePrice(i: StrategyInput): { price: number; source: string } | null {
  if (i.bestBid && i.bestAsk) return { price: (i.bestBid + i.bestAsk) / 2, source: "mid" };
  if (i.lastPrice) return { price: i.lastPrice, source: "last trade" };
  if (i.bestBid) return { price: i.bestBid, source: "best bid" };
  if (i.bestAsk) return { price: i.bestAsk, source: "best ask" };
  if (i.bot.anchorPrice) return { price: Number(i.bot.anchorPrice), source: "operator anchor" };
  return null;
}

/** Size an order to the notional cap and step size; null when it cannot meet exchange minimums. */
function size(i: StrategyInput, price: number, maxNotional: number): string | null {
  const qty = roundToStep(maxNotional / price, i.market.stepSize, "down");
  if (Number(qty) < Number(i.market.minQuantity) || Number(qty) * price < Number(i.market.minNotional)) return null;
  return qty;
}

/**
 * Maker and liquidity bots: post-only GTC ladders around the reference price,
 * skewed against inventory. Orders are only cancelled when their price drifts
 * more than `requoteBps` from target (no churn), and each side is capped by
 * what the wallet can actually fund.
 */
export function quotePlan(i: StrategyInput): Plan {
  const { limits: L } = i.bot;
  const ref = referencePrice(i);
  if (!ref) return idle("no reliable price: not quoting");
  const tick = i.market.tickSize;

  // Inventory skew: shift quotes down when long base, up when light, up to ±spread/2.
  const baseValue = i.holdingsBase * ref.price;
  const ratio = baseValue / Math.max(baseValue + i.available.quote, 1e-9);
  const skew = (0.5 - ratio) * (L.spreadBps / 2) * 1e-4;

  const want: { side: "BUY" | "SELL"; price: string }[] = [];
  for (let k = 0; k < L.levels; k++) {
    const off = (L.spreadBps + k * L.levelStepBps) * 1e-4;
    let bid = Number(roundToStep(ref.price * (1 - off + skew), tick, "down"));
    let ask = Number(roundToStep(ref.price * (1 + off + skew), tick, "up"));
    // Never cross the live spread (post-only would reject it anyway).
    if (i.bestAsk && bid >= i.bestAsk) bid = Number(roundToStep(i.bestAsk - Number(tick), tick, "down"));
    if (i.bestBid && ask <= i.bestBid) ask = Number(roundToStep(i.bestBid + Number(tick), tick, "up"));
    want.push({ side: "BUY", price: String(bid) }, { side: "SELL", price: String(ask) });
  }

  // Keep resting orders that are close enough to some target; cancel the rest.
  const cancels: string[] = [];
  const unmatched = [...want];
  for (const o of i.open) {
    const idx = unmatched.findIndex((w) => w.side === o.side && Math.abs(Number(o.price) - Number(w.price)) / ref.price <= L.requoteBps * 1e-4);
    if (idx >= 0) unmatched.splice(idx, 1);
    else cancels.push(o.orderId);
  }

  const places: OrderInput[] = [];
  let quote = i.available.quote, base = i.available.base;
  let openCount = i.open.length - cancels.length;
  let session = i.sessionNotional;
  for (const w of unmatched) {
    if (openCount >= L.maxOpenOrders) break;
    const p = Number(w.price);
    if (p <= 0) continue;
    const qty = size(i, p, L.maxOrderNotional);
    if (!qty) return { cancels, places, note: `order size below exchange minimum (minNotional ${i.market.minNotional})` };
    const notional = Number(qty) * p;
    if (session + notional > L.maxSessionNotional) break;
    if (w.side === "BUY") {
      if (quote < notional * 1.002 || i.holdingsBase + Number(qty) > L.maxInventoryBase) continue;
      quote -= notional * 1.002;
    } else {
      if (base < Number(qty)) continue;
      base -= Number(qty);
    }
    places.push({ symbol: i.market.symbol, side: w.side, orderType: "LIMIT", price: w.price, quantity: qty, postOnly: true, timeInForce: "GTC" });
    openCount++;
    session += notional;
  }
  const sides = new Set([...i.open.filter((o) => !cancels.includes(o.orderId)).map((o) => o.side), ...places.map((p) => p.side)]);
  const note = sides.size === 2 ? `quoting both sides @ ${ref.source}` : `one-sided (${[...sides].join("") || "none"}): balance or limits`;
  return { cancels, places, note };
}

/**
 * Taker: one bounded IOC limit that may sweep up to `takerSlippageBps` past the
 * opposite best price, sized to the notional cap and the depth visible within
 * that band. Side follows inventory so a taker does not drain one side.
 */
export function takerPlan(i: StrategyInput): Plan {
  const L = i.bot.limits;
  if (i.open.length) return idle("waiting for previous order to settle");
  if (!i.bestBid || !i.bestAsk) return idle("need both sides of the book to take");
  const ref = (i.bestBid + i.bestAsk) / 2;
  const baseValue = i.holdingsBase * ref;
  const buy = baseValue < i.available.quote && i.holdingsBase < L.maxInventoryBase;
  const best = buy ? i.bestAsk : i.bestBid;
  const slip = L.takerSlippageBps * 1e-4;
  const price = Number(roundToStep(best * (buy ? 1 + slip : 1 - slip), i.market.tickSize, buy ? "down" : "up"));
  const visible = (buy ? i.depthAskQty ?? i.bestAskQty : i.depthBidQty ?? i.bestBidQty) ?? Infinity;
  const qty = size(i, price, Math.min(L.maxOrderNotional, visible * best));
  if (!qty) return idle("top level too small for exchange minimums");
  const notional = Number(qty) * price;
  if (i.sessionNotional + notional > L.maxSessionNotional) return idle("session budget exhausted");
  if (buy ? i.available.quote < notional * 1.002 : i.available.base < Number(qty)) return idle("insufficient balance");
  return {
    cancels: [],
    places: [{ symbol: i.market.symbol, side: buy ? "BUY" : "SELL", orderType: "LIMIT", price: String(price), quantity: qty, timeInForce: "IOC" }],
    note: `${buy ? "sweeping asks ≤" : "sweeping bids ≥"} ${price}`,
  };
}

export const planFor = (i: StrategyInput): Plan => (i.bot.role === "taker" ? takerPlan(i) : quotePlan(i));
