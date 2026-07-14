import React, { useMemo } from "react"

export type Candle = {
  open: number
  high: number
  low: number
  close: number
}

type CandlestickChartProps = {
  candles: Candle[]
  width?: number
  height?: number
}

export default function CandlestickChart({
  candles = [],
  width = 620,
  height = 260,
}: CandlestickChartProps) {
  const { minPrice, maxPrice, scaleY, getX, stepX, gridLines, lastPriceY } = useMemo(() => {
    if (candles.length === 0) {
      return {
        minPrice: 0,
        maxPrice: 100,
        scaleY: (v: number) => 0,
        getX: (i: number) => 0,
        stepX: 0,
        gridLines: [],
        lastPriceY: 0,
      }
    }

    // Find min and max bounds across all candles (with a 5% padding)
    const highs = candles.map((c) => c.high)
    const lows = candles.map((c) => c.low)
    const absMax = Math.max(...highs)
    const absMin = Math.min(...lows)
    const diff = absMax - absMin || 1
    const maxPrice = absMax + diff * 0.05
    const minPrice = Math.max(0, absMin - diff * 0.05)

    const padding = { top: 20, bottom: 20, left: 10, right: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const scaleY = (val: number) => {
      const pct = (val - minPrice) / (maxPrice - minPrice)
      return padding.top + chartHeight - pct * chartHeight
    }

    const stepX = chartWidth / candles.length
    const getX = (index: number) => {
      return padding.left + index * stepX + stepX / 2
    }

    // Generate gridlines (4 horizontal lines)
    const gridCount = 4
    const gridLines = Array.from({ length: gridCount }).map((_, i) => {
      const val = minPrice + (diff / (gridCount - 1)) * i
      return {
        price: val,
        y: scaleY(val),
      }
    })

    const lastCandle = candles[candles.length - 1]
    const lastPriceY = scaleY(lastCandle.close)

    return { minPrice, maxPrice, scaleY, getX, stepX, gridLines, lastPriceY }
  }, [candles, width, height])

  if (candles.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No chart data available
      </div>
    )
  }

  // Width of each candle body
  const candleBodyWidth = Math.max(2, stepX * 0.7)

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="select-none overflow-visible"
    >
      {/* Gridlines and labels */}
      <g className="opacity-20">
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1="10"
              y1={line.y}
              x2={width - 60}
              y2={line.y}
              stroke="currentColor"
              strokeWidth="0.8"
              strokeDasharray="2,2"
              className="text-foreground"
            />
            <text
              x={width - 55}
              y={line.y + 4}
              fontSize="9"
              fill="currentColor"
              className="text-foreground font-medium"
            >
              ${line.price.toFixed(2)}
            </text>
          </g>
        ))}
      </g>

      {/* Render Candlesticks */}
      <g>
        {candles.map((candle, i) => {
          const isPositive = candle.close >= candle.open
          const x = getX(i)
          const yOpen = scaleY(candle.open)
          const yClose = scaleY(candle.close)
          const yHigh = scaleY(candle.high)
          const yLow = scaleY(candle.low)

          const rectY = Math.min(yOpen, yClose)
          const rectHeight = Math.max(1, Math.abs(yClose - yOpen))

          const colorClass = isPositive ? "text-emerald-500" : "text-rose-500"

          return (
            <g key={i} className="hover:opacity-80 transition-opacity">
              {/* Wick */}
              <line
                x1={x}
                y1={yLow}
                x2={x}
                y2={yHigh}
                stroke="currentColor"
                strokeWidth="1.2"
                className={colorClass}
              />
              {/* Body */}
              <rect
                x={x - candleBodyWidth / 2}
                y={rectY}
                width={candleBodyWidth}
                height={rectHeight}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1"
                className={colorClass}
              />
            </g>
          )
        })}
      </g>

      {/* Live Price line indicator */}
      <g>
        <line
          x1="10"
          y1={lastPriceY}
          x2={width - 60}
          y2={lastPriceY}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4,3"
          className="text-emerald-400"
        />
        {/* Label badge on the right axis */}
        <rect
          x={width - 58}
          y={lastPriceY - 7}
          width={54}
          height={14}
          rx="3"
          fill="#10b981"
          className="shadow-sm"
        />
        <text
          x={width - 31}
          y={lastPriceY + 3}
          fontSize="9"
          fontWeight="bold"
          fill="#ffffff"
          textAnchor="middle"
        >
          ${candles[candles.length - 1].close.toFixed(2)}
        </text>
      </g>
    </svg>
  )
}
