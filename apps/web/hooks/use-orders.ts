"use client"

import { useCallback, useMemo } from "react"
import { toast } from "sonner"
import { ordersApi } from "@/lib/api/orders"
import { ApiError, toApiError } from "@/lib/api/client"
import type { MarketInfo, PlaceOrderRequest } from "@/lib/api/types"
import { useMarkets } from "@/hooks/use-market-data"
import { useAppDispatch } from "@/hooks/useRedux"
import { cancelFailed, cancelRequested, orderAccepted } from "@/store/slices/orders"

/** Market rules by symbol (precision for order rows). */
export function useMarketMap(): Record<string, MarketInfo> {
  const { markets } = useMarkets()
  return useMemo(() => Object.fromEntries(markets.map((m) => [m.symbol, m])), [markets])
}

/**
 * DELETE /order/:id answers 202 "cancellation requested"; the order stays
 * listed as cancelling until order.cancelled (or order.cancel_rejected).
 */
export function useCancelOrder() {
  const dispatch = useAppDispatch()
  return useCallback(
    async (orderId: string) => {
      dispatch(cancelRequested(orderId))
      try {
        await ordersApi.cancel(orderId)
      } catch (err) {
        dispatch(cancelFailed(orderId))
        const e = toApiError(err, "Cancel failed")
        toast.error(e.status === 409 ? "Order already closed" : "Cancel failed", { description: e.message })
        throw e
      }
    },
    [dispatch],
  )
}

/** Cancels each order independently (there is no batch cancel API). */
export function useCancelMany() {
  const cancel = useCancelOrder()
  return useCallback(
    async (orderIds: string[]) => {
      const results = await Promise.allSettled(orderIds.map((id) => cancel(id)))
      const failed = results.filter((r) => r.status === "rejected").length
      const ok = results.length - failed
      if (ok) toast.info(`Cancellation requested for ${ok} order${ok === 1 ? "" : "s"}`)
      return { ok, failed }
    },
    [cancel],
  )
}

/**
 * POST /order. A 202 means funds are reserved and the order is queued for the
 * engine — not that anything executed. The order is shown as Pending until
 * the private stream reports what happened.
 */
export function usePlaceOrder() {
  const dispatch = useAppDispatch()
  return useCallback(
    async (req: PlaceOrderRequest) => {
      try {
        const { data } = await ordersApi.place(req)
        dispatch(orderAccepted(data.order))
        return data
      } catch (err) {
        throw err instanceof ApiError ? err : toApiError(err, "Order could not be placed")
      }
    },
    [dispatch],
  )
}
