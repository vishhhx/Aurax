"use client"

import { createContext, useContext, useMemo, useState } from "react"
import type { MarketInfo, Side } from "@/lib/api/types"

/** A price picked from the book or trades, handed to the order form. */
export interface PricePick {
  price: string
  side?: Side
  /** Changes on every pick so picking the same price twice still applies */
  nonce: number
}

interface TerminalState {
  market: MarketInfo
  pick: PricePick | null
  pickPrice: (price: string, side?: Side) => void
}

const TerminalContext = createContext<TerminalState | null>(null)

export function TerminalProvider({ market, children }: { market: MarketInfo; children: React.ReactNode }) {
  const [pick, setPick] = useState<PricePick | null>(null)
  const value = useMemo<TerminalState>(
    () => ({ market, pick, pickPrice: (price, side) => setPick((p) => ({ price, side, nonce: (p?.nonce ?? 0) + 1 })) }),
    [market, pick],
  )
  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
}

export function useTerminal(): TerminalState {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used inside TerminalProvider")
  return ctx
}
