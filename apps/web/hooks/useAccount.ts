"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useSocket } from "@/context/socketProvider"
import { api } from "@/lib/axios"
import { getSocketSession, subscribeSocketSession } from "@/lib/socket"
import { useAppSelector } from "@/hooks/useRedux"
import { selectIsAuthenticated } from "@/store/slices/authSlice"

/** Private socket message (event "user"); delivered at-least-once → dedupe by eventId. */
export interface UserMessage {
  type:
    | "order.accepted"
    | "order.opened"
    | "order.partially_filled"
    | "order.filled"
    | "order.cancelled"
    | "order.rejected"
    | "order.cancel_rejected"
    | "trade.executed"
    | "balance.updated"
    | "deposit.completed"
  eventId: string
  data: Record<string, unknown>
  timestamp: number
}

export interface SessionInfo {
  authenticated: boolean
  userId?: string
  reason?: "invalid_token" | "expired_token"
}

/**
 * Subscribes to private events for the authenticated socket session.
 * Deduplicates by eventId per listener (each hook instance sees every event once).
 */
export function useUserEvents(handler: (m: UserMessage) => void): void {
  const socket = useSocket()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const seen = new Set<string>()
    const on = (m: UserMessage) => {
      if (!m?.eventId || seen.has(m.eventId)) return
      seen.add(m.eventId)
      if (seen.size > 5_000) seen.delete(seen.values().next().value as string)
      ref.current(m)
    }
    socket.on("user", on)
    return () => {
      socket.off("user", on)
    }
  }, [socket])
}

/** The gateway's view of this socket (public-only vs authenticated). */
export function useSocketSession(): SessionInfo | null {
  return useSyncExternalStore(subscribeSocketSession, getSocketSession, () => null)
}

export interface OrderRow {
  orderId: string
  symbol: string
  side: "BUY" | "SELL"
  orderType: "LIMIT" | "MARKET"
  price: string | null
  quantity: string
  executedQuantity: string
  remainingQuantity: string
  averagePrice: string | null
  status: string
  createdAt: string
}

export interface FillRow {
  tradeId: string
  executionId: string
  orderId: string
  symbol: string
  side: "BUY" | "SELL"
  price: string
  quantity: string
  fee: string
  liquidity: "MAKER" | "TAKER"
  createdAt: string
}

const ORDER_EVENTS = new Set<UserMessage["type"]>([
  "order.accepted",
  "order.opened",
  "order.partially_filled",
  "order.filled",
  "order.cancelled",
  "order.rejected",
])

/**
 * The user's open orders and recent fills from order-service, refreshed
 * whenever a private lifecycle event arrives (the REST API stays the source
 * of truth; events only trigger refreshes).
 */
export function useMyOrders(symbol?: string) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const [openOrders, setOpenOrders] = useState<OrderRow[]>([])
  const [fills, setFills] = useState<FillRow[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const q = symbol ? `&symbol=${symbol}` : ""
      const [o, t] = await Promise.all([
        api.get(`/api/v1/order?status=open&limit=50${q}`),
        api.get(`/api/v1/order/trades?limit=30${q}`),
      ])
      setOpenOrders(o.data.data)
      setFills(t.data.data)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [isAuthenticated, symbol])

  useEffect(() => {
    // Load asynchronously; state is only set once the request settles.
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  useUserEvents((m) => {
    if (ORDER_EVENTS.has(m.type) || m.type === "trade.executed") void refresh()
  })

  const cancel = useCallback(
    async (orderId: string) => {
      await api.delete(`/api/v1/order/${orderId}`)
      await refresh()
    },
    [refresh],
  )

  return { openOrders, fills, state, refresh, cancel }
}
