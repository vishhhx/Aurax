import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

export const APP_DIR = resolve(import.meta.dir, "../..");
export const STATE_DIR = join(APP_DIR, ".state");
export const RUN_DIR = join(STATE_DIR, "run");
export const LOG_DIR = join(STATE_DIR, "logs");
export const PLAN_FILE = join(STATE_DIR, "bots.json");
export const KILL_FILE = join(STATE_DIR, "KILL");
for (const d of [STATE_DIR, RUN_DIR, LOG_DIR]) mkdirSync(d, { recursive: true });

export const MAX_BOTS = 15;
export const ROLES = ["maker", "taker", "liquidity"] as const;
export type Role = (typeof ROLES)[number];

export const ENV = {
  API_URL: (process.env.AURAX_API_URL ?? "http://localhost:5000").replace(/\/+$/, ""),
  WS_URL: (process.env.AURAX_WS_URL ?? "http://localhost:5005").replace(/\/+$/, ""),
  /** Dev-only: the local JWT_ACCESS_SECRET, used to mint short-lived tokens for provisioned bot users. */
  DEV_JWT_SECRET: process.env.AURAX_DEV_JWT_SECRET ?? "",
  ALLOW_REMOTE: process.env.AURAX_BOTS_ALLOW_REMOTE === "1",
};

/** Refuse to run anywhere that is not obviously a local development stack. */
export function assertDevOnly(): void {
  if (process.env.NODE_ENV === "production") throw new Error("trading-bots refuse to run with NODE_ENV=production");
  for (const url of [ENV.API_URL, ENV.WS_URL]) {
    const host = new URL(url).hostname;
    if (!ENV.ALLOW_REMOTE && !["localhost", "127.0.0.1", "::1"].includes(host)) {
      throw new Error(`refusing non-local backend ${url} (set AURAX_BOTS_ALLOW_REMOTE=1 for an isolated dev host)`);
    }
  }
}

export interface Limits {
  dryRun: boolean;
  cooldownMs: number;
  maxOrderNotional: number; // quote
  maxSessionNotional: number; // quote, total submitted this session
  maxOpenOrders: number;
  maxInventoryBase: number; // hard cap on base-asset holdings
  spreadBps: number; // maker/liquidity: distance of first level from reference
  levels: number; // resting orders per side
  levelStepBps: number;
  requoteBps: number; // re-quote only when target moved this much
  takerSlippageBps: number; // taker: how far past the best price an IOC may sweep
  cancelOnExit: boolean;
}

export interface BotDef {
  id: string; // stable, e.g. btcusdc-maker-01
  name: string; // BTCUSDC-MAKER-01
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  role: Role;
  userId?: string; // set by seeding
  email?: string;
  budget: { base: string; quote: string };
  /** Operator-supplied price used only when the market has no book and no trades. */
  anchorPrice?: string;
  limits: Limits;
  enabled: boolean;
}

export interface Plan {
  version: 1;
  createdAt: string;
  bots: BotDef[];
}

export function defaultLimits(role: Role): Limits {
  return {
    dryRun: true,
    cooldownMs: role === "taker" ? 1000 : 800,
    maxOrderNotional: 200,
    maxSessionNotional: 25000,
    maxOpenOrders: role === "liquidity" ? 10 : 4,
    maxInventoryBase: Infinity,
    spreadBps: role === "liquidity" ? 12 : 4,
    levels: role === "liquidity" ? 5 : 2,
    levelStepBps: 8,
    requoteBps: role === "liquidity" ? 20 : 6,
    takerSlippageBps: 15,
    cancelOnExit: true,
  };
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, (_k, v) => (v === Infinity ? null : v), 2));
  renameSync(tmp, file);
}

export function loadPlan(): Plan | null {
  const plan = readJson<Plan>(PLAN_FILE);
  for (const b of plan?.bots ?? []) {
    b.limits = { ...defaultLimits(b.role), ...b.limits, dryRun: b.limits.dryRun };
    if (b.limits.maxInventoryBase == null) b.limits.maxInventoryBase = Infinity;
  }
  return plan;
}

export const killed = () => existsSync(KILL_FILE);
