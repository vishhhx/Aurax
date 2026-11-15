import { afterEach, describe, expect, test } from "bun:test"
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { apiGet, ApiError, http, onSessionExpired, toApiError } from "@/lib/api/client"
import { ordersApi } from "@/lib/api/orders"
import { walletApi } from "@/lib/api/wallet"

type Reply = { status: number; data: unknown; headers?: Record<string, string> }

const original = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = original
})

/** Routes requests to canned replies and records them. */
function mockAdapter(route: (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>) {
  const calls: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    const r = await route(config)
    const response = { data: r.data, status: r.status, statusText: String(r.status), headers: new AxiosHeaders(r.headers ?? {}), config, request: {} }
    if (r.status >= 400) throw new AxiosError(`HTTP ${r.status}`, r.status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST", config, {}, response)
    return response
  }
  http.defaults.adapter = adapter
  return calls
}

describe("toApiError", () => {
  test("keeps the server message and normalises order rule issues", () => {
    const err = new AxiosError("x", "ERR_BAD_REQUEST", undefined, {}, {
      status: 400,
      statusText: "",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { success: false, data: null, message: "Price must be a multiple of 0.01", errors: [{ field: "price", message: "TICK_SIZE" }] },
    })
    const e = toApiError(err)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(400)
    expect(e.message).toBe("Price must be a multiple of 0.01")
    expect(e.has("TICK_SIZE")).toBe(true)
  })

  test("reservation codes and zod issue paths", () => {
    const mk = (errors: unknown) => toApiError(new AxiosError("x", "", undefined, {}, { status: 400, statusText: "", headers: {}, config: { headers: new AxiosHeaders() }, data: { message: "m", errors } }))
    expect(mk([{ code: "INSUFFICIENT_BALANCE" }]).has("INSUFFICIENT_BALANCE")).toBe(true)
    expect(mk([{ path: ["limit"], message: "Too big" }]).issues[0]).toEqual({ field: "limit", message: "Too big", code: undefined })
  })

  test("429 uses Retry-After; no response means network", () => {
    const rl = toApiError(new AxiosError("x", "", undefined, {}, { status: 429, statusText: "", headers: { "retry-after": "12" }, config: { headers: new AxiosHeaders() }, data: {} }))
    expect(rl.retryAfter).toBe(12)
    expect(rl.message).toContain("12s")
    expect(toApiError(new AxiosError("Network Error", "ERR_NETWORK")).isNetwork).toBe(true)
  })
})

describe("refresh on 401", () => {
  test("concurrent 401s share one refresh, then retry", async () => {
    let refreshed = false
    const calls = mockAdapter((c) => {
      if (c.url?.endsWith("/sessions/refresh")) {
        refreshed = true
        return { status: 200, data: { success: true, data: { accessToken: "t" } } }
      }
      return refreshed ? { status: 200, data: { success: true, data: [c.url] } } : { status: 401, data: { message: "Invalid or expired access token" } }
    })
    const [a, b] = await Promise.all([apiGet<string[]>("/api/v1/order"), apiGet<string[]>("/api/v1/wallet/assets")])
    expect(a).toEqual(["/api/v1/order"])
    expect(b).toEqual(["/api/v1/wallet/assets"])
    expect(calls.filter((c) => c.url?.endsWith("/sessions/refresh"))).toHaveLength(1)
    expect(calls.every((c) => c.withCredentials === true)).toBe(true)
  })

  test("a failed refresh expires the session and surfaces the original 401", async () => {
    let expired = 0
    const off = onSessionExpired(() => expired++)
    const calls = mockAdapter((c) => (c.url?.endsWith("/sessions/refresh") ? { status: 401, data: { message: "Invalid or expired refresh token." } } : { status: 401, data: { message: "Access token required" } }))
    const err = await apiGet("/api/v1/order").catch((e: unknown) => e)
    off()
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect(expired).toBe(1)
    expect(calls.filter((c) => c.url?.endsWith("/sessions/refresh"))).toHaveLength(1)
  })
})

describe("endpoint contracts", () => {
  test("place order posts the documented body and returns the 202 payload", async () => {
    const calls = mockAdapter(() => ({
      status: 202,
      data: { success: true, message: "Order accepted", data: { order: { orderId: "o1", status: "PENDING" }, reserved: { assetId: "a", amount: "65.13" } } },
    }))
    const res = await ordersApi.place({ symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "0.001", price: "65000", timeInForce: "GTC", postOnly: false })
    expect(calls[0]!.method).toBe("post")
    expect(calls[0]!.url).toBe("/api/v1/order")
    expect(JSON.parse(calls[0]!.data as string)).toEqual({ symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "0.001", price: "65000", timeInForce: "GTC", postOnly: false })
    expect(res.status).toBe(202)
    expect(res.data.order.status).toBe("PENDING")
  })

  test("history uses keyset paging params and drops empty ones", async () => {
    const calls = mockAdapter(() => ({ status: 200, data: { success: true, data: [] } }))
    await ordersApi.list({ status: "closed", before: "ord_9", limit: 25 })
    await walletApi.ledger({ referenceType: "FEE" })
    expect(calls[0]!.params).toEqual({ status: "closed", limit: 25, before: "ord_9" })
    expect(calls[1]!.url).toBe("/api/v1/wallet/ledger")
    expect(calls[1]!.params).toEqual({ referenceType: "FEE", limit: 50 })
  })

  test("cancel is DELETE /order/:id", async () => {
    const calls = mockAdapter(() => ({ status: 202, data: { success: true, message: "Cancellation requested", data: {} } }))
    await ordersApi.cancel("ord/1")
    expect(calls[0]!.method).toBe("delete")
    expect(calls[0]!.url).toBe("/api/v1/order/ord%2F1")
  })

  test("wallet balances are always strings", async () => {
    mockAdapter(() => ({ status: 200, data: { success: true, data: [{ assetId: "a", symbol: "BTC", availableBalance: 0, lockedBalance: "0.5" }] } }))
    const [a] = await walletApi.assets()
    expect(a!.availableBalance).toBe("0")
    expect(a!.lockedBalance).toBe("0.5")
  })
})
