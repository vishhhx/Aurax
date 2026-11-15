import { describe, expect, test } from "bun:test"
import walletReducer, { balanceUpdated, fetchWallet, type WalletState } from "@/store/slices/wallet"
import ordersReducer, { cancelRequested, fetchOpenOrders, orderAccepted, orderEvent, type OrdersState } from "@/store/slices/orders"
import authReducer, { fetchSession, sessionExpired } from "@/store/slices/auth"
import type { UserMessage } from "@/lib/ws/schemas"
import { asset, order } from "./fixtures"

const walletInit = walletReducer(undefined, { type: "init" })
const ordersInit = ordersReducer(undefined, { type: "init" })

const fulfilledWallet = (assets: ReturnType<typeof asset>[], startedAt: number) => fetchWallet.fulfilled({ assets, startedAt }, "req")
const fulfilledOrders = (rows: ReturnType<typeof order>[]) => fetchOpenOrders.fulfilled(rows, "req")

describe("wallet slice (versioned balances)", () => {
  const loaded: WalletState = walletReducer(walletInit, fulfilledWallet([asset()], 0))

  test("applies the newest version and ignores older or replayed ones", () => {
    let s = walletReducer(loaded, balanceUpdated({ assetId: "ast_usdc", available: "90", locked: "10", version: 200 }))
    expect(s.assets[0]!.availableBalance).toBe("90")
    s = walletReducer(s, balanceUpdated({ assetId: "ast_usdc", available: "100", locked: "0", version: 100 }))
    s = walletReducer(s, balanceUpdated({ assetId: "ast_usdc", available: "1", locked: "1", version: 200 }))
    expect(s.assets[0]!.availableBalance).toBe("90")
    expect(s.assets[0]!.lockedBalance).toBe("10")
  })

  test("an event for an unknown asset marks the wallet stale (refetch) instead of inventing a row", () => {
    const s = walletReducer(loaded, balanceUpdated({ assetId: "ast_new", available: "5", locked: "0", version: 1 }))
    expect(s.stale).toBe(true)
    expect(s.assets).toHaveLength(1)
  })

  test("a REST response started before a live event does not overwrite it", () => {
    const withEvent = walletReducer(loaded, balanceUpdated({ assetId: "ast_usdc", available: "42", locked: "0", version: 300 }))
    const staleResponse = walletReducer(withEvent, fulfilledWallet([asset({ availableBalance: "100" })], 0))
    expect(staleResponse.assets[0]!.availableBalance).toBe("42")
    const freshResponse = walletReducer(withEvent, fulfilledWallet([asset({ availableBalance: "41" })], Date.now() + 1_000))
    expect(freshResponse.assets[0]!.availableBalance).toBe("41")
  })

  test("is cleared when the session expires", () => {
    expect(walletReducer(loaded, sessionExpired()).assets).toEqual([])
  })
})

const ev = (type: string, data: Record<string, unknown>, eventId = `${type}:${Math.random()}`): UserMessage => ({ type, eventId, timestamp: 1_700_000_000_000, data }) as unknown as UserMessage

describe("orders slice (async lifecycle)", () => {
  test("order.accepted before the 202 does not duplicate the order", () => {
    let s = ordersReducer(ordersInit, orderEvent(ev("order.accepted", { orderId: "o1", symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "1", price: "10" })))
    s = ordersReducer(s, orderAccepted(order({ orderId: "o1", status: "PENDING" })))
    expect(s.open.map((o) => o.orderId)).toEqual(["o1"])
    expect(s.open[0]!.status).toBe("PENDING") // accepted ≠ executed
    expect(s.open[0]!.executedQuantity).toBe("0")
  })

  test("partial fill updates quantities; full fill removes the order", () => {
    let s = ordersReducer(ordersInit, orderAccepted(order({ orderId: "o1", quantity: "1", remainingQuantity: "1" })))
    const fill = (status: string, executed: string, remaining: string) =>
      ev("order.partially_filled", { orderId: "o1", symbol: "BTCUSDC", side: "BUY", lastFillPrice: "10", lastFillQuantity: "0.4", executedQuantity: executed, remainingQuantity: remaining, status })
    s = ordersReducer(s, orderEvent(fill("PARTIALLY_FILLED", "0.4", "0.6")))
    expect(s.open[0]).toMatchObject({ status: "PARTIALLY_FILLED", executedQuantity: "0.4", remainingQuantity: "0.6" })
    s = ordersReducer(s, orderEvent({ ...fill("FILLED", "1", "0"), type: "order.filled" } as UserMessage))
    expect(s.open).toEqual([])
    expect(s.closed.o1).toBe("FILLED")
  })

  test("a slower refetch never resurrects a closed order or rolls back fills", () => {
    let s = ordersReducer(ordersInit, fulfilledOrders([order({ orderId: "o1" }), order({ orderId: "o2", quantity: "1", remainingQuantity: "1" })]))
    s = ordersReducer(s, orderEvent(ev("order.cancelled", { orderId: "o1", symbol: "BTCUSDC", reason: "USER_CANCELLED" })))
    s = ordersReducer(
      s,
      orderEvent(ev("order.partially_filled", { orderId: "o2", symbol: "BTCUSDC", side: "BUY", lastFillPrice: "1", lastFillQuantity: "0.5", executedQuantity: "0.5", remainingQuantity: "0.5", status: "PARTIALLY_FILLED" })),
    )
    // order-service has not persisted either change yet:
    s = ordersReducer(s, fulfilledOrders([order({ orderId: "o1" }), order({ orderId: "o2", quantity: "1", remainingQuantity: "1", executedQuantity: "0" })]))
    expect(s.open.map((o) => o.orderId)).toEqual(["o2"])
    expect(s.open[0]).toMatchObject({ executedQuantity: "0.5", status: "PARTIALLY_FILLED" })
  })

  test("cancel stays pending until the engine answers", () => {
    let s = ordersReducer(ordersInit, fulfilledOrders([order({ orderId: "o1" })]))
    s = ordersReducer(s, cancelRequested("o1"))
    expect(s.cancelling.o1).toBe(true)
    expect(s.open).toHaveLength(1)
    s = ordersReducer(s, orderEvent(ev("order.cancel_rejected", { orderId: "o1", symbol: "BTCUSDC", reason: "NOT_OPEN" })))
    expect(s.cancelling.o1).toBeUndefined()
  })

  test("rejected orders leave the open list", () => {
    let s: OrdersState = ordersReducer(ordersInit, orderAccepted(order({ orderId: "o9", status: "PENDING" })))
    s = ordersReducer(s, orderEvent(ev("order.rejected", { orderId: "o9", symbol: "BTCUSDC", reason: "POST_ONLY_WOULD_TAKE_LIQUIDITY" })))
    expect(s.open).toEqual([])
    expect(s.closed.o9).toBe("REJECTED")
  })
})

describe("auth slice", () => {
  const init = authReducer(undefined, { type: "init" })
  test("starts unknown, never signed out", () => {
    expect(init.status).toBe("unknown")
  })
  test("401 means signed out; other failures are errors, not sign-outs", () => {
    expect(authReducer(init, fetchSession.rejected(null, "r", undefined, { message: "x", status: 401 })).status).toBe("unauthenticated")
    expect(authReducer(init, fetchSession.rejected(null, "r", undefined, { message: "down", status: 502 })).status).toBe("error")
  })
  test("session expiry clears the user", () => {
    const signedIn = authReducer(init, fetchSession.fulfilled({ userId: "u", email: "e", name: "n", provider: "google", isEmailVerified: true }, "r"))
    expect(signedIn.status).toBe("authenticated")
    expect(authReducer(signedIn, sessionExpired())).toMatchObject({ user: null, status: "unauthenticated" })
  })
})
