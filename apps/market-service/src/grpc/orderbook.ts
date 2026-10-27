import * as grpc from "@grpc/grpc-js";
import {
  loadProto,
  type GetEngineStatusResponse__Output,
  type GetOrderBookResponse__Output,
  type OrderProtoGrpcType,
} from "@repo/grpc";

import { ENV } from "../config/env";
import type { RawBookSnapshot } from "../processors/orderbook-sync";

/**
 * The engine runs one worker per market shard, each serving gRPC on its own
 * port. ORDER_GRPC_URL is either a single `host:port` (all markets) or
 * shard routes: `BTCUSDC,ETHUSDC=127.0.0.1:8003;SOLUSDC,USDTUSDC=127.0.0.1:8004`.
 */
export function parseEngineRoutes(value: string): { routes: Map<string, string>; fallback?: string } {
  const routes = new Map<string, string>();
  if (!value.includes("=")) return { routes, fallback: value.trim() };
  for (const part of value.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [symbols, address] = part.split("=");
    if (!symbols || !address) throw new Error(`Invalid ORDER_GRPC_URL route: ${part}`);
    for (const s of symbols.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)) routes.set(s, address.trim());
  }
  return { routes };
}

const proto = await loadProto<OrderProtoGrpcType>("order");
const { routes, fallback } = parseEngineRoutes(ENV.ORDER_GRPC_URL);
const clients = new Map<string, InstanceType<typeof proto.order.MatchingEngine>>();

function client(address: string) {
  let c = clients.get(address);
  if (!c) {
    // Reconnect quickly after an engine restart (grpc-js defaults back off up to 120 s).
    c = new proto.order.MatchingEngine(address, grpc.credentials.createInsecure(), {
      "grpc.initial_reconnect_backoff_ms": 500,
      "grpc.max_reconnect_backoff_ms": 5_000,
    });
    clients.set(address, c);
  }
  return c;
}

function addressFor(symbol: string): string {
  const address = routes.get(symbol) ?? fallback;
  if (!address) throw new Error(`No matching-engine route for ${symbol} in ORDER_GRPC_URL`);
  return address;
}

const deadline = () => new Date(Date.now() + ENV.GRPC_TIMEOUT_MS);

function status(address: string): Promise<GetEngineStatusResponse__Output> {
  return new Promise((resolve, reject) => {
    client(address).getEngineStatus({}, { deadline: deadline() }, (err, response) => {
      if (err) return reject(new Error(`GetEngineStatus(${address}) failed: ${err.message}`));
      if (!response) return reject(new Error(`GetEngineStatus(${address}) returned no response`));
      resolve(response);
    });
  });
}

class MatchingEngineClient {
  /** Ready only when every engine shard serving `symbols` reports LIVE. */
  async getEngineStatus(symbols: string[] = ENV.MARKETS): Promise<GetEngineStatusResponse__Output> {
    const addresses = [...new Set(symbols.map(addressFor))];
    const statuses = await Promise.all(addresses.map(status));
    const notReady = statuses.find((s) => !s.isReady);
    return notReady ?? statuses[0] ?? { isReady: false, status: "NO_ENGINE", errorCode: "NO_ROUTE" };
  }

  getOrderBook(symbol: string): Promise<RawBookSnapshot> {
    return new Promise((resolve, reject) => {
      client(addressFor(symbol)).getOrderBook({ symbol }, { deadline: deadline() }, (err, response?: GetOrderBookResponse__Output) => {
        if (err) return reject(new Error(`GetOrderBook(${symbol}) failed: ${err.message}`));
        if (!response) return reject(new Error(`GetOrderBook(${symbol}) returned no response`));
        resolve({
          symbol: response.symbol,
          sequenceNumber: response.sequenceNumber,
          bids: response.bids.map((l) => ({ price: l.price, quantity: l.quantity })),
          asks: response.asks.map((l) => ({ price: l.price, quantity: l.quantity })),
        });
      });
    });
  }

  close(): void {
    for (const c of clients.values()) c.close();
  }
}

export const matchingEngine = new MatchingEngineClient();
