import { describe, expect, test } from "bun:test"
import { checkDraft, estimateMarketFill, quantityForFraction, type OrderDraft } from "@/lib/trading/order-rules"
import { BTCUSDC } from "./fixtures"

const draft = (p: Partial<OrderDraft> = {}): OrderDraft => ({ side: "BUY", orderType: "LIMIT", price: "65000", quantity: "0.001", timeInForce: "GTC", postOnly: false, ...p })

describe("checkDraft", () => {
  test("valid limit buy builds the exact request and reservation", () => {
    const c = checkDraft(BTCUSDC, draft(), "1000")
    expect(c.errors).toEqual({})
    expect(c.request).toEqual({ symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "0.001", price: "65000", timeInForce: "GTC", postOnly: false })
    expect(c.notional).toBe("65")
    // Same formula and example as order-service: 65 × (1 + 0.002) = 65.13
    expect(c.reservation).toEqual({ asset: "USDC", amount: "65.13" })
    expect(c.maxFee).toBe("0.13")
  })

  test("price must sit on the tick", () => {
    expect(checkDraft(BTCUSDC, draft({ price: "65000.015" }), null).errors.price).toBe("Price must be a multiple of 0.01")
  })

  test("quantity must sit on the step and in range", () => {
    expect(checkDraft(BTCUSDC, draft({ quantity: "0.000015" }), null).errors.quantity).toBe("Quantity must be a multiple of 0.00001")
    expect(checkDraft(BTCUSDC, draft({ quantity: "101" }), null).errors.quantity).toContain("between")
  })

  test("minimum notional", () => {
    expect(checkDraft(BTCUSDC, draft({ price: "10", quantity: "0.05" }), null).errors.quantity).toBe("Order value must be at least 1 USDC")
  })

  test("market buy is refused because the backend rejects it", () => {
    const c = checkDraft(BTCUSDC, draft({ orderType: "MARKET", price: "" }), "1000", true)
    expect(c.errors.form).toContain("Market buy orders are not supported")
    expect(c.request).toBeNull()
  })

  test("market sell is IOC without a price and reserves base", () => {
    const c = checkDraft(BTCUSDC, draft({ side: "SELL", orderType: "MARKET", price: "" }), "1")
    expect(c.request).toEqual({ symbol: "BTCUSDC", side: "SELL", orderType: "MARKET", quantity: "0.001", timeInForce: "IOC" })
    expect(c.reservation).toEqual({ asset: "BTC", amount: "0.001" })
  })

  test("post-only needs GTC", () => {
    expect(checkDraft(BTCUSDC, draft({ postOnly: true, timeInForce: "IOC" }), null).errors.form).toBe("Post-only requires a GTC limit order")
  })

  test("insufficient balance is reported before submit", () => {
    expect(checkDraft(BTCUSDC, draft(), "65.12").errors.form).toBe("Insufficient USDC balance")
    expect(checkDraft(BTCUSDC, draft(), "65.13").errors.form).toBeUndefined()
  })

  test("non-trading market blocks new orders", () => {
    expect(checkDraft({ ...BTCUSDC, status: "HALTED" }, draft(), null).errors.form).toContain("halted")
  })

  test("empty fields only error on submit", () => {
    expect(checkDraft(BTCUSDC, draft({ quantity: "" }), null).errors.quantity).toBeUndefined()
    expect(checkDraft(BTCUSDC, draft({ quantity: "" }), null, true).errors.quantity).toBe("Enter a quantity")
  })
})

describe("quantityForFraction", () => {
  test("buy budget includes the maximum fee and floors to the step", () => {
    // 100 USDC at 65000 with 0.2% fee → 100 / 65130 = 0.0015353… → 0.00153
    expect(quantityForFraction(BTCUSDC, "BUY", "100", "1", "65000")).toBe("0.00153")
  })
  test("sell uses the base balance", () => {
    expect(quantityForFraction(BTCUSDC, "SELL", "0.123456789", "0.5", null)).toBe("0.06172")
  })
  test("buy needs a price", () => {
    expect(quantityForFraction(BTCUSDC, "BUY", "100", "1", null)).toBeNull()
  })
})

describe("estimateMarketFill", () => {
  const bids = [
    { price: "100", quantity: "1" },
    { price: "99", quantity: "2" },
  ]
  test("walks levels", () => {
    expect(estimateMarketFill(bids, "2", 2)).toEqual({ filled: "2", quote: "199", averagePrice: "99.5", partial: false })
  })
  test("flags a thin book", () => {
    expect(estimateMarketFill(bids, "5", 2).partial).toBe(true)
  })
})
