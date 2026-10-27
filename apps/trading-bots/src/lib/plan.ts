import { defaultLimits, MAX_BOTS, type BotDef, type Limits, type Plan, type Role } from "./config";
import type { Market } from "./http";
import { onStep } from "./precision";

export interface MarketAllocation {
  symbol: string;
  roles: Record<Role, number>;
  budget: { base: string; quote: string }; // per market, split evenly across its bots
  anchorPrice?: string;
  limits: Partial<Limits>;
}

const DEC = /^\d+(\.\d+)?$/;

/** Throws with a readable reason; returns a plan of stable bot definitions otherwise. */
export function buildPlan(totalBots: number, allocations: MarketAllocation[], markets: Market[]): Plan {
  if (!Number.isInteger(totalBots) || totalBots < 1 || totalBots > MAX_BOTS) throw new Error(`bot count must be 1–${MAX_BOTS}`);
  const sum = allocations.reduce((n, a) => n + a.roles.maker + a.roles.taker + a.roles.liquidity, 0);
  if (sum !== totalBots) throw new Error(`allocations add up to ${sum} bots, expected ${totalBots}`);
  const seen = new Set<string>();
  const bots: BotDef[] = [];
  for (const a of allocations) {
    const m = markets.find((x) => x.symbol === a.symbol);
    if (!m) throw new Error(`unknown market ${a.symbol}`);
    if (m.status !== "TRADING") throw new Error(`market ${a.symbol} is ${m.status}`);
    if (seen.has(a.symbol)) throw new Error(`market ${a.symbol} listed twice`);
    seen.add(a.symbol);
    for (const r of Object.values(a.roles)) if (!Number.isInteger(r) || r < 0) throw new Error(`invalid role count for ${a.symbol}`);
    for (const v of [a.budget.base, a.budget.quote]) if (!DEC.test(v)) throw new Error(`invalid budget "${v}" for ${a.symbol}`);
    if (a.anchorPrice !== undefined && (!DEC.test(a.anchorPrice) || !onStep(a.anchorPrice, m.tickSize))) throw new Error(`anchor price must be a multiple of tick ${m.tickSize}`);
    const n = a.roles.maker + a.roles.taker + a.roles.liquidity;
    if (n === 0) continue;
    const split = (v: string, step: string) => {
      const dp = step.includes(".") ? step.split(".")[1]!.length : 0;
      return (Math.floor((Number(v) / n) * 10 ** dp) / 10 ** dp).toFixed(dp);
    };
    for (const role of ["maker", "taker", "liquidity"] as Role[]) {
      for (let k = 1; k <= a.roles[role]; k++) {
        const name = `${m.symbol}-${role.toUpperCase()}-${String(k).padStart(2, "0")}`;
        const limits = { ...defaultLimits(role), ...a.limits };
        if (limits.maxOrderNotional <= 0 || limits.maxSessionNotional <= 0 || limits.maxOpenOrders < 1 || limits.cooldownMs < 250) throw new Error("limits must be positive (cooldown ≥ 250ms)");
        bots.push({
          id: name.toLowerCase(),
          name,
          symbol: m.symbol,
          baseAsset: m.baseAsset,
          quoteAsset: m.quoteAsset,
          role,
          budget: { base: split(a.budget.base, m.stepSize), quote: split(a.budget.quote, "0.01") },
          anchorPrice: a.anchorPrice,
          limits,
          enabled: true,
        });
      }
    }
  }
  return { version: 1, createdAt: new Date().toISOString(), bots };
}
