import type { MarketInfo, Order, WalletAsset } from "@/lib/api/types"

/** Test fixtures only; never imported by application code. */
export const BTCUSDC: MarketInfo = {
  marketId: "mkt_btc",
  symbol: "BTCUSDC",
  baseAsset: "BTC",
  quoteAsset: "USDC",
  status: "TRADING",
  tickSize: "0.01",
  stepSize: "0.00001",
  minPrice: "0.01",
  maxPrice: "1000000",
  minQuantity: "0.00001",
  maxQuantity: "100",
  minNotional: "1",
  makerFee: "0.001",
  takerFee: "0.002",
  pricePrecision: 2,
  quantityPrecision: 5,
}

export function order(patch: Partial<Order> = {}): Order {
  return {
    orderId: "ord_1",
    symbol: "BTCUSDC",
    side: "BUY",
    orderType: "LIMIT",
    price: "65000",
    quantity: "0.002",
    executedQuantity: "0",
    remainingQuantity: "0.002",
    averagePrice: null,
    timeInForce: "GTC",
    postOnly: false,
    status: "OPEN",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    ...patch,
  }
}

export function asset(patch: Partial<WalletAsset> = {}): WalletAsset {
  return {
    assetId: "ast_usdc",
    symbol: "USDC",
    name: "USD Coin",
    imageUrl: null,
    decimals: 8,
    network: null,
    depositEnabled: true,
    withdrawalEnabled: true,
    minDeposit: "0",
    minWithdrawal: "0",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    availableBalance: "100",
    lockedBalance: "0",
    ...patch,
  }
}

/** Minimal socket.io stand-in recording emits and letting tests fire events. */
export class FakeSocket {
  connected = true
  emitted: Array<{ event: string; payload: unknown; ack?: (a: unknown) => void }> = []
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, fn: (...args: never[]) => void) {
    const list = this.handlers.get(event) ?? []
    list.push(fn as (...args: unknown[]) => void)
    this.handlers.set(event, list)
    return this
  }

  emit(event: string, payload?: unknown, ack?: (a: unknown) => void) {
    this.emitted.push({ event, payload, ack })
    return this
  }

  fire(event: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(event) ?? []) fn(...args)
  }

  payloads(event = "market") {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload as Record<string, unknown>)
  }
}
