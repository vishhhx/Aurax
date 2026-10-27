import { memo } from "react"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPercentString } from "@/lib/market-client"

type SparklineProps = {
  points: number[]
  width?: number
  height?: number
  className?: string
}

export const Sparkline = memo(function Sparkline({
  points,
  width = 96,
  height = 32,
  className,
}: SparklineProps) {
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p < min) min = p
    if (p > max) max = p
  }
  const range = max - min || 1
  const stepX = width / (points.length - 1)
  const d = points
    .map((p, i) => {
      const x = (i * stepX).toFixed(1)
      const y = (height - ((p - min) / range) * (height - 2) - 1).toFixed(1)
      return `${i === 0 ? "M" : "L"}${x} ${y}`
    })
    .join("")
  if (points.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className={className} />
  }
  const isUp = points[points.length - 1]! >= points[0]!

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className={cn(isUp ? "text-up" : "text-down", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
})

export function CoinBadge({
  symbol,
  className,
}: {
  symbol: string
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-[0.65rem] font-bold tracking-tight text-foreground",
        className
      )}
    >
      {symbol.slice(0, 3)}
    </span>
  )
}

export function PriceChange({
  value,
  withIcon = false,
  className,
}: {
  /** Percent as a decimal string from the server, or null when no trades */
  value: string | null
  withIcon?: boolean
  className?: string
}) {
  if (value === null) {
    return <span className={cn("font-medium text-muted-foreground tabular-nums", className)}>—</span>
  }
  const isUp = Number(value) >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        isUp ? "text-up" : "text-down",
        className
      )}
    >
      {withIcon ? (
        isUp ? (
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownRightIcon className="size-3.5" aria-hidden="true" />
        )
      ) : null}
      {formatPercentString(value)}
    </span>
  )
}
