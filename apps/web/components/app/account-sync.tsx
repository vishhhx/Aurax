"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { onSessionExpired, onSessionRefreshed, refreshSession } from "@/lib/api/client"
import { normalize } from "@/lib/decimal"
import { reasonLabel } from "@/lib/format"
import { preferencesStore, DEFAULT_PREFERENCES } from "@/lib/stores/preferences"
import { reconnectSocket } from "@/lib/ws"
import type { UserMessage } from "@/lib/ws/schemas"
import { useConnection } from "@/hooks/use-market-data"
import { useAuth, useUserEvents } from "@/hooks/use-account"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { sessionExpired } from "@/store/slices/auth"
import { balanceUpdated, fetchWallet } from "@/store/slices/wallet"
import { fetchOpenOrders, orderEvent } from "@/store/slices/orders"
import { notify, type AppNotification } from "@/store/slices/notifications"

const ORDER_REFETCH_DELAY = 400

/** Toast + feed entry for a private event; null for events that only update state. */
function describe(m: UserMessage): Omit<AppNotification, "id" | "at"> | null {
  switch (m.type) {
    case "order.filled":
      return { tone: "success", title: `Order filled · ${m.data.symbol}`, description: `${m.data.side} ${normalize(m.data.executedQuantity ?? m.data.lastFillQuantity)} — last fill at ${normalize(m.data.lastFillPrice)}`, href: `/orders/${m.data.orderId}` }
    case "order.partially_filled":
      return { tone: "info", title: `Partial fill · ${m.data.symbol}`, description: `${m.data.side} ${normalize(m.data.lastFillQuantity)} at ${normalize(m.data.lastFillPrice)}`, href: `/orders/${m.data.orderId}` }
    case "order.cancelled":
      return {
        tone: "info",
        title: `Order cancelled · ${m.data.symbol}`,
        description: `${reasonLabel(m.data.reason)}${m.data.remainingQuantity ? ` · ${normalize(m.data.remainingQuantity)} unfilled released` : ""}`,
        href: `/orders/${m.data.orderId}`,
      }
    case "order.rejected":
      return { tone: "error", title: `Order rejected · ${m.data.symbol}`, description: reasonLabel(m.data.reason), href: `/orders/${m.data.orderId}` }
    case "order.cancel_rejected":
      return { tone: "warning", title: `Cancel not applied · ${m.data.symbol}`, description: reasonLabel(m.data.reason), href: `/orders/${m.data.orderId}` }
    case "deposit.completed":
      return { tone: "success", title: "Deposit credited", description: `${normalize(m.data.amount)} USDC added to your wallet`, href: `/wallet/deposits/${m.data.depositId}` }
    default:
      return null
  }
}

/**
 * Mounted once. Bridges the private socket and session lifecycle into state:
 * - balance.updated → wallet (highest version wins)
 * - order events → open orders, plus a debounced refetch (REST stays authoritative)
 * - deposit.completed → balance refetch and notification
 * - every authenticated (re)connect → refetch balances and open orders,
 *   since nothing is replayed while the socket was down
 * - session expiry/refresh → clear state / reconnect the socket on the new cookie
 */
export function AccountSync() {
  const dispatch = useAppDispatch()
  const { isAuthenticated } = useAuth()
  const { session, epoch } = useConnection()
  const walletStale = useAppSelector((s) => s.wallet.stale)
  const prefs = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.get, () => DEFAULT_PREFERENCES)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketRetry = useRef<"idle" | "tried">("idle")

  useEffect(() => {
    const offExpired = onSessionExpired(() => {
      dispatch(sessionExpired())
      reconnectSocket()
    })
    const offRefreshed = onSessionRefreshed(() => reconnectSocket())
    return () => {
      offExpired()
      offRefreshed()
    }
  }, [dispatch])

  // Keep the socket's identity in step with the HTTP session.
  useEffect(() => {
    if (!session) return
    if (session.authenticated) {
      socketRetry.current = "idle"
      return
    }
    if (!isAuthenticated || socketRetry.current === "tried") return
    socketRetry.current = "tried"
    if (session.reason === "expired_token" || session.reason === "invalid_token") {
      // Refresh rotates the cookie; onSessionRefreshed reconnects.
      refreshSession().catch(() => {})
    } else {
      reconnectSocket() // signed in after the socket connected
    }
  }, [session, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) socketRetry.current = "idle"
  }, [isAuthenticated])

  // Authoritative HTTP state after sign-in and after every authenticated (re)connect.
  const authedEpoch = isAuthenticated && session?.authenticated ? epoch : -1
  useEffect(() => {
    if (!isAuthenticated) return
    void dispatch(fetchWallet())
    void dispatch(fetchOpenOrders())
  }, [dispatch, isAuthenticated, authedEpoch])

  useEffect(() => {
    if (walletStale && isAuthenticated) void dispatch(fetchWallet())
  }, [walletStale, isAuthenticated, dispatch])

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
    },
    [],
  )

  useUserEvents((m) => {
    if (m.type === "balance.updated") {
      dispatch(balanceUpdated({ assetId: m.data.assetId, available: m.data.available, locked: m.data.locked, version: m.data.version }))
      return
    }
    if (m.type === "deposit.completed") {
      void dispatch(fetchWallet())
    } else if (m.type !== "trade.executed") {
      dispatch(orderEvent(m))
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      refetchTimer.current = setTimeout(() => void dispatch(fetchOpenOrders()), ORDER_REFETCH_DELAY)
    }

    const n = describe(m)
    if (!n) return
    dispatch(notify({ ...n, id: m.eventId, at: m.timestamp }))
    const isFill = m.type === "order.filled" || m.type === "order.partially_filled"
    if (isFill && !prefs.fillToasts) return
    const show = n.tone === "success" ? toast.success : n.tone === "error" ? toast.error : n.tone === "warning" ? toast.warning : toast.info
    show(n.title, { description: n.description, id: m.eventId })
  })

  return null
}
