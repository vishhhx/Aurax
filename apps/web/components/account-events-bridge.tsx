"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useSocket } from "@/context/socketProvider"
import { useSocketSession, useUserEvents } from "@/hooks/useAccount"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { selectIsAuthenticated } from "@/store/slices/authSlice"
import { applyBalanceUpdate, fetchWalletAssets } from "@/store/slices/walletSlice"

/**
 * Bridges private socket events into app state (mounted once):
 * - balance.updated → wallet store (versioned, never regresses)
 * - deposit.completed → toast + balance refetch
 * - order lifecycle → toasts
 * - keeps the socket's auth in step with the session: after login or a token
 *   refresh, a public-only socket reconnects so the gateway re-reads the
 *   accessToken cookie.
 */
export function AccountEventsBridge() {
  const dispatch = useAppDispatch()
  const socket = useSocket()
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const session = useSocketSession()
  const reconnected = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      reconnected.current = false
      return
    }
    if (session && !session.authenticated && !reconnected.current) {
      reconnected.current = true
      socket.disconnect().connect()
    }
    if (session?.authenticated) reconnected.current = false
  }, [isAuthenticated, session, socket])

  useUserEvents((m) => {
    const d = m.data
    switch (m.type) {
      case "balance.updated":
        dispatch(
          applyBalanceUpdate({
            assetId: String(d.assetId),
            available: String(d.available),
            locked: String(d.locked),
            version: Number(d.version),
          }),
        )
        break
      case "deposit.completed":
        toast.success("Deposit credited", { description: `${d.amount} added to your wallet` })
        void dispatch(fetchWalletAssets())
        break
      case "order.filled":
        toast.success(`Order filled · ${d.symbol}`, { description: `${d.side} ${d.executedQuantity ?? d.lastFillQuantity}` })
        break
      case "order.partially_filled":
        toast.info(`Partial fill · ${d.symbol}`, { description: `${d.lastFillQuantity} @ ${d.lastFillPrice}` })
        break
      case "order.cancelled":
        toast.info(`Order cancelled · ${d.symbol}`, { description: `Unfilled ${d.remainingQuantity} released` })
        break
      case "order.rejected":
        toast.error(`Order rejected · ${d.symbol}`, { description: String(d.reason) })
        break
      default:
        break
    }
  })

  return null
}
