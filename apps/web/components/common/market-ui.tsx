"use client"

import { memo, useId, useState } from "react"
import { cn } from "@/lib/utils"
import { direction, formatAmount, formatPercent, statusLabel } from "@/lib/format"
import { Badge } from "@/components/ui/badge"

/**
 * Neutral monogram. Asset logos exist only behind the authenticated wallet
 * API (missing-backend-capabilities.md #8), so public pages use this.
 */
export function AssetIcon({ symbol, imageUrl, className }: { symbol: string; imageUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (imageUrl && failed !== imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote URLs from the wallet API, unknown hosts
    return <img src={imageUrl} alt="" onError={() => setFailed(imageUrl)} className={cn("size-6 shrink-0 rounded-full border object-cover", className)} />
  }
  return (
    <span aria-hidden="true" className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[9px] font-semibold text-muted-foreground", className)}>
      {symbol.slice(0, 3)}
    </span>
  )
}

const toneClass = { up: "text-up", down: "text-down", flat: "text-muted-foreground" } as const

/** Signed 24h change; colour follows the sign, and the sign is always shown (not colour alone). */
export function PriceChange({ value, className }: { value: string | null | undefined; className?: string }) {
  return <span className={cn("num font-medium", toneClass[direction(value)], className)}>{formatPercent(value)}</span>
}

/** A decimal string rendered with fixed precision and tabular digits. */
export function Amount({ value, decimals, className, trim, tone }: { value: string | null | undefined; decimals: number; className?: string; trim?: boolean; tone?: "up" | "down" }) {
  return <span className={cn("num", tone && toneClass[tone], className)}>{formatAmount(value, decimals, { trim })}</span>
}

export const Sparkline = memo(function Sparkline({ points, width = 80, height = 24, className }: { points: number[]; width?: number; height?: number; className?: string }) {
  const gid = useId()
  if (points.length < 2) return <svg width={width} height={height} aria-hidden="true" className={className} />
  let lo = Infinity
  let hi = -Infinity
  for (const p of points) {
    if (p < lo) lo = p
    if (p > hi) hi = p
  }
  const range = hi - lo || 1
  const step = (width - 3) / (points.length - 1)
  const xy = points.map((p, i) => [i * step, height - 2 - ((p - lo) / range) * (height - 4)] as const)
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")
  const area = `${line}L${xy[xy.length - 1]![0].toFixed(1)} ${height}L0 ${height}Z`
  const [ex, ey] = xy[xy.length - 1]!
  const up = points[points.length - 1]! >= points[0]!
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className={cn("overflow-visible", up ? "text-up" : "text-down", className)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={3} fill="currentColor" opacity={0.25} />
      <circle cx={ex} cy={ey} r={1.5} fill="currentColor" />
    </svg>
  )
})

type Tone = "neutral" | "up" | "down" | "warning" | "info"

const TONES: Record<string, Tone> = {
  PENDING: "info",
  OPEN: "info",
  PARTIALLY_FILLED: "warning",
  FILLED: "up",
  CANCELLED: "neutral",
  REJECTED: "down",
  EXPIRED: "neutral",
  CONFIRMING: "warning",
  COMPLETED: "up",
  FAILED: "down",
  TRADING: "up",
  HALTED: "down",
  MAINTENANCE: "warning",
  CANCEL_ONLY: "warning",
  POST_ONLY: "warning",
}

const toneStyles: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  up: "border-up/30 bg-up/10 text-up",
  down: "border-down/30 bg-down/10 text-down",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-border bg-muted text-foreground",
}

/** Order, deposit and market status as the backend reports it. */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-md font-medium", toneStyles[TONES[status] ?? "neutral"], className)}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}

export function SideLabel({ side, className }: { side: "BUY" | "SELL"; className?: string }) {
  return <span className={cn("font-medium", side === "BUY" ? "text-up" : "text-down", className)}>{side === "BUY" ? "Buy" : "Sell"}</span>
}
