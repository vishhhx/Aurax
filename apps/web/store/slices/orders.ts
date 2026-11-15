import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import * as D from "@/lib/decimal"
import { ordersApi } from "@/lib/api/orders"
import { toApiError } from "@/lib/api/client"
import { OPEN_STATUSES, type Order, type OrderStatus } from "@/lib/api/types"
import type { UserMessage } from "@/lib/ws/schemas"
import { signOut, sessionExpired } from "./auth"

/**
 * The caller's open orders (PENDING, OPEN, PARTIALLY_FILLED).
 *
 * GET /order?status=open is the source of truth. Private events apply the
 * server's own values (status, executed/remaining quantity) immediately and
 * a refetch follows. Because order-service may persist a fill slightly after
 * the socket delivers it, a refetch never resurrects an order an event has
 * already closed, nor rolls back its executed quantity.
 */

export interface OrdersState {
  open: Order[]
  status: "idle" | "loading" | "ready" | "error"
  error: string | null
  /** orderId → terminal status learned from events (bounded) */
  closed: Record<string, OrderStatus>
  /** Cancels accepted with 202 whose outcome has not arrived yet */
  cancelling: Record<string, true>
}

const initialState: OrdersState = { open: [], status: "idle", error: null, closed: {}, cancelling: {} }
const CLOSED_CAPACITY = 500

export const fetchOpenOrders = createAsyncThunk<Order[], void, { rejectValue: string }>("orders/fetchOpen", async (_, { rejectWithValue }) => {
  try {
    return await ordersApi.list({ status: "open", limit: 200 })
  } catch (err) {
    return rejectWithValue(toApiError(err, "Failed to load open orders").message)
  }
})

const isOpen = (s: OrderStatus) => OPEN_STATUSES.includes(s)

function rememberClosed(state: OrdersState, orderId: string, status: OrderStatus) {
  state.closed[orderId] = status
  const keys = Object.keys(state.closed)
  if (keys.length > CLOSED_CAPACITY) delete state.closed[keys[0]!]
  state.open = state.open.filter((o) => o.orderId !== orderId)
  delete state.cancelling[orderId]
}

const furthest = (a: string, b: string) => (D.gte(a, b) ? a : b)

const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    cancelRequested(state, action: PayloadAction<string>) {
      state.cancelling[action.payload] = true
    },
    cancelFailed(state, action: PayloadAction<string>) {
      delete state.cancelling[action.payload]
    },
    /** The 202 response; the order.accepted event may arrive before or after it. */
    orderAccepted(state, action: PayloadAction<Order>) {
      const o = action.payload
      if (state.closed[o.orderId] || state.open.some((x) => x.orderId === o.orderId)) return
      state.open.unshift(o)
    },
    orderEvent(state, action: PayloadAction<UserMessage>) {
      const m = action.payload
      switch (m.type) {
        case "order.accepted": {
          const d = m.data
          if (state.closed[d.orderId] || state.open.some((o) => o.orderId === d.orderId)) return
          const createdAt = typeof d.createdAt === "string" ? d.createdAt : new Date(m.timestamp).toISOString()
          state.open.unshift({
            orderId: d.orderId,
            symbol: d.symbol,
            side: d.side,
            orderType: d.orderType,
            price: d.price,
            quantity: d.quantity,
            executedQuantity: "0",
            remainingQuantity: d.quantity,
            averagePrice: null,
            timeInForce: (typeof d.timeInForce === "string" ? d.timeInForce : "GTC") as Order["timeInForce"],
            postOnly: d.postOnly === true,
            status: "PENDING",
            createdAt,
            updatedAt: createdAt,
          })
          return
        }
        case "order.opened": {
          const o = state.open.find((x) => x.orderId === m.data.orderId)
          if (!o) return
          if (o.status === "PENDING") o.status = "OPEN"
          o.executedQuantity = furthest(o.executedQuantity, m.data.executedQuantity)
          o.remainingQuantity = m.data.remainingQuantity
          return
        }
        case "order.partially_filled":
        case "order.filled": {
          const d = m.data
          if (!isOpen(d.status)) {
            rememberClosed(state, d.orderId, d.status)
            return
          }
          const o = state.open.find((x) => x.orderId === d.orderId)
          if (!o) return
          o.status = d.status
          if (d.executedQuantity) o.executedQuantity = furthest(o.executedQuantity, d.executedQuantity)
          if (d.remainingQuantity) o.remainingQuantity = D.lte(d.remainingQuantity, o.remainingQuantity) ? d.remainingQuantity : o.remainingQuantity
          return
        }
        case "order.cancelled":
          rememberClosed(state, m.data.orderId, "CANCELLED")
          return
        case "order.rejected":
          rememberClosed(state, m.data.orderId, "REJECTED")
          return
        case "order.cancel_rejected":
          delete state.cancelling[m.data.orderId]
          return
        default:
          return
      }
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchOpenOrders.pending, (s) => {
      s.status = s.status === "ready" ? "ready" : "loading"
      s.error = null
    })
      .addCase(fetchOpenOrders.fulfilled, (s, a) => {
        const known = new Map(s.open.map((o) => [o.orderId, o]))
        s.open = a.payload
          .filter((o) => !s.closed[o.orderId])
          .map((o) => {
            const cur = known.get(o.orderId)
            if (!cur || D.gte(o.executedQuantity, cur.executedQuantity)) return o
            return { ...o, executedQuantity: cur.executedQuantity, remainingQuantity: cur.remainingQuantity, status: cur.status }
          })
        for (const id of Object.keys(s.cancelling)) if (!s.open.some((o) => o.orderId === id)) delete s.cancelling[id]
        s.status = "ready"
      })
      .addCase(fetchOpenOrders.rejected, (s, a) => {
        s.status = s.open.length ? "ready" : "error"
        s.error = a.payload ?? "Failed to load open orders"
      })
      .addCase(signOut.fulfilled, () => initialState)
      .addCase(sessionExpired, () => initialState)
  },
})

export const { orderAccepted, orderEvent, cancelRequested, cancelFailed } = ordersSlice.actions
export default ordersSlice.reducer

type WithOrders = { orders: OrdersState }
export const selectOpenOrders = (s: WithOrders) => s.orders.open
