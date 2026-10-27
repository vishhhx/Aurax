import { signToken } from "@repo/core/jwt";
import { ENV } from "./config";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number | null, // null = no response (network/timeout): outcome unknown
    public body?: unknown,
  ) {
    super(message);
  }
  get ambiguous() {
    return this.status === null || this.status >= 500;
  }
}

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  tickSize: string;
  stepSize: string;
  minQuantity: string;
  minNotional: string;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface Order {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET";
  price: string | null;
  quantity: string;
  executedQuantity: string;
  remainingQuantity: string;
  status: "PENDING" | "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";
  createdAt: string;
}

export interface Balance {
  symbol: string;
  availableBalance: string;
  lockedBalance: string;
}

export interface OrderInput {
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET";
  quantity: string;
  price?: string;
  postOnly?: boolean;
  timeInForce?: "GTC" | "IOC" | "FOK";
}

export interface Identity {
  userId: string;
  email: string;
  name: string;
}

/**
 * Thin client for the API Gateway (`/api/v1/<service>/...`). Auth: a short-lived
 * access token minted for a provisioned dev bot user (see README). GETs retry on
 * network/5xx; writes never retry — the caller reconciles instead.
 */
export class AuraxHttp {
  private token: { value: string; exp: number } | null = null;

  constructor(
    private identity?: Identity,
    private log: (msg: string) => void = () => {},
    private timeoutMs = 5000,
  ) {}

  private auth(): Record<string, string> {
    return this.identity ? { Authorization: `Bearer ${this.accessToken()}` } : {};
  }

  accessToken(): string {
    if (!this.identity) throw new Error("no identity");
    if (!ENV.DEV_JWT_SECRET) throw new Error("AURAX_DEV_JWT_SECRET is not set (apps/trading-bots/.env)");
    if (!this.token || Date.now() > this.token.exp) {
      this.token = { value: signToken(this.identity, ENV.DEV_JWT_SECRET, "10m"), exp: Date.now() + 9 * 60_000 };
    }
    return this.token.value;
  }

  async request<T>(method: string, path: string, body?: unknown, retries = method === "GET" ? 2 : 0): Promise<T> {
    const cid = crypto.randomUUID().slice(0, 8);
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(`${ENV.API_URL}/api/v1${path}`, {
          method,
          headers: { "Content-Type": "application/json", "X-Correlation-Id": cid, ...this.auth() },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
        this.log(`${method} ${path.split("?")[0]} → ${res.status} ${Date.now() - started}ms [${cid}]`);
        if (!res.ok || !json || json.success === false) {
          throw new HttpError(json?.message ?? `HTTP ${res.status}`, res.status, json);
        }
        return json.data as T;
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError((e as Error).message, null);
        if (!err.ambiguous || attempt >= retries) throw err;
        await Bun.sleep(300 * 2 ** attempt);
      }
    }
  }

  health = () => fetch(`${ENV.API_URL}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok);
  markets = () => this.request<Market[]>("GET", "/market/markets");
  orderbook = (s: string, limit = 20) =>
    this.request<{ sequenceNumber: string; bids: Level[]; asks: Level[] }>("GET", `/market/markets/${s}/orderbook?limit=${limit}`);
  candles = (s: string, interval = "1m", limit = 8) => this.request<Candle[]>("GET", `/market/markets/${s}/candles?interval=${interval}&limit=${limit}`);
  ticker = (s: string) => this.request<{ lastPrice: string | null }>("GET", `/market/markets/${s}/ticker`);

  balances = () => this.request<Balance[]>("GET", "/wallet/assets");
  openOrders = (symbol: string) => this.request<Order[]>("GET", `/order?status=open&symbol=${symbol}&limit=200`);
  orders = (symbol: string, limit = 20) => this.request<Order[]>("GET", `/order?status=all&symbol=${symbol}&limit=${limit}`);
  trades = (symbol: string, limit = 20) => this.request<Trade[]>("GET", `/order/trades?symbol=${symbol}&limit=${limit}`);
  order = (id: string) => this.request<Order>("GET", `/order/${id}`);
  place = (o: OrderInput) => this.request<{ order: Order }>("POST", "/order", o).then((r) => r.order);
  cancel = (id: string) => this.request<Order>("DELETE", `/order/${id}`);
}

export interface Level {
  price: string;
  quantity: string;
}

export interface Candle {
  interval?: string;
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  isClosed?: boolean;
}

export interface Trade {
  tradeId: string;
  side: string;
  price: string;
  quantity: string;
  executedAt: number | string;
  [k: string]: unknown;
}
