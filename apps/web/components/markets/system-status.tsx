"use client"

import { useCallback, useEffect, useState } from "react"
import { RotateCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/common/page"
import { StatusBadge } from "@/components/common/market-ui"
import { useConnection, useMarkets } from "@/hooks/use-market-data"
import { http } from "@/lib/api/client"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"

type Check = { state: "checking" | "ok" | "down"; detail: string }

async function probe(path: string): Promise<Check> {
  try {
    const res = await http.get(path, { skipAuthRefresh: true, timeout: 8_000, validateStatus: () => true })
    if (res.status >= 200 && res.status < 300) return { state: "ok", detail: `HTTP ${res.status}` }
    return { state: "down", detail: `HTTP ${res.status}` }
  } catch {
    return { state: "down", detail: "Unreachable" }
  }
}

function Row({ name, check, description }: { name: string; check: Check; description: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className={cn("flex items-center gap-2 text-xs", check.state === "ok" ? "text-up" : check.state === "down" ? "text-down" : "text-muted-foreground")}>
        <span aria-hidden="true" className={cn("size-2 rounded-full", check.state === "ok" ? "bg-up" : check.state === "down" ? "bg-down" : "bg-muted-foreground")} />
        {check.state === "checking" ? "Checking…" : check.state === "ok" ? "Operational" : "Unavailable"}
        <span className="text-muted-foreground">· {check.detail}</span>
      </span>
    </li>
  )
}

/** Live checks against the real health endpoints (gateway, market-service readiness, socket). */
export function SystemStatus() {
  const [gateway, setGateway] = useState<Check>({ state: "checking", detail: "" })
  const [market, setMarket] = useState<Check>({ state: "checking", detail: "" })
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const { state } = useConnection()
  const { markets, status } = useMarkets()

  const probeAll = useCallback(
    () =>
      Promise.all([probe("/health"), probe("/api/v1/market/health/ready")]).then(([g, m]) => {
        setGateway(g)
        setMarket(m)
        setCheckedAt(Date.now())
      }),
    [],
  )

  useEffect(() => {
    void probeAll()
  }, [probeAll])

  const run = () => {
    setGateway({ state: "checking", detail: "" })
    setMarket({ state: "checking", detail: "" })
    void probeAll()
  }

  const socket: Check = state === "connected" ? { state: "ok", detail: "Connected" } : state === "offline" ? { state: "down", detail: "Offline" } : { state: "checking", detail: state }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Services"
        actions={
          <Button variant="ghost" size="xs" onClick={run}>
            <RotateCwIcon data-icon="inline-start" />
            Recheck{checkedAt ? ` · ${formatTime(checkedAt)}` : ""}
          </Button>
        }
      >
        <ul className="divide-y">
          <Row name="API gateway" description="HTTP API for accounts, wallet and orders" check={gateway} />
          <Row name="Market data" description="Markets, tickers, order books and candles" check={market} />
          <Row name="Real-time stream" description="Live market data and account events" check={socket} />
        </ul>
      </Panel>
      <Panel title="Markets">
        {status !== "ready" ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{status === "error" ? "Market list unavailable." : "Loading…"}</p>
        ) : (
          <ul className="divide-y">
            {markets.map((m) => (
              <li key={m.symbol} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">
                  {m.baseAsset}/{m.quoteAsset}
                </span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
