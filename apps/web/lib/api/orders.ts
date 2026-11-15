import { apiDelete, apiGet, apiPost } from "./client"
import type { Fill, Order, OrderDetail, PlaceOrderRequest, PlaceOrderResponse } from "./types"

/**
 * order-service (api-gateway /api/v1/order, access token required).
 *
 * Placement and cancellation are asynchronous: 202 means "reserved and
 * queued", never "executed". Final state arrives on the private socket or via
 * GET /order/:id.
 */

const BASE = "/api/v1/order"

export type OrderListStatus = "open" | "closed" | "all"

export interface PageQuery {
  limit?: number
  /** id of the last row of the previous page (keyset paging, newest first) */
  before?: string
}

export const ordersApi = {
  place: (body: PlaceOrderRequest) => apiPost<PlaceOrderResponse>(BASE, body),
  cancel: (orderId: string) => apiDelete<Order>(`${BASE}/${encodeURIComponent(orderId)}`),
  list: (q: { status?: OrderListStatus; symbol?: string } & PageQuery = {}) =>
    apiGet<Order[]>(BASE, { status: q.status ?? "all", symbol: q.symbol, limit: q.limit ?? 50, before: q.before }),
  get: (orderId: string) => apiGet<OrderDetail>(`${BASE}/${encodeURIComponent(orderId)}`),
  trades: (q: { symbol?: string } & PageQuery = {}) =>
    apiGet<Fill[]>(`${BASE}/trades`, { symbol: q.symbol, limit: q.limit ?? 50, before: q.before }),
}
