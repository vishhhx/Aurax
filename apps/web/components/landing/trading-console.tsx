"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { TradingTerminal } from "@/components/trade/trading-terminal"

/**
 * The landing-page trading section shows the REAL terminal. The original
 * simulator is kept only for explicit demo deployments
 * (NEXT_PUBLIC_DEMO_MODE=true) and is clearly labelled there.
 */
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

const DemoExchange = dynamic(() => import("@/components/live-exchange"), {
  ssr: false,
  loading: () => <Skeleton className="h-[520px] w-full rounded-xl" />,
})

export function TradingConsole() {
  if (DEMO_MODE) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Demo mode — simulated prices and balances, not connected to Aurax.</p>
        <DemoExchange />
      </div>
    )
  }
  return <TradingTerminal />
}
