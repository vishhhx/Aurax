"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createTextWatermark,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ITextWatermarkPluginApi,
  type Time,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts"
import type { Candle, MarketInfo } from "@/lib/api/types"
import { formatAmount, formatCompact, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * OHLCV chart on lightweight-charts. Candles arrive as decimal strings and
 * are converted to numbers here only for plotting. Colours come from the
 * theme tokens so both themes stay in sync.
 */

type Palette = { text: string; grid: string; crosshair: string; label: string; watermark: string; up: string; down: string; upVol: string; downVol: string; font: string }

/**
 * Resolve a CSS colour token (oklch, possibly translucent) to rgba via a canvas pixel — the
 * chart's canvas parser needs plain colours. The token's own alpha is kept and multiplied by
 * `alpha` (glass tokens like --chart-grid are mostly transparent).
 */
function resolveColor(token: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!ctx || !value) return `rgba(128,128,128,${alpha})`
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r},${g},${b},${+(((a ?? 255) / 255) * alpha).toFixed(3)})`
}

function readPalette(): Palette {
  return {
    text: resolveColor("--muted-foreground"),
    grid: resolveColor("--chart-grid"),
    crosshair: resolveColor("--foreground", 0.35),
    label: resolveColor("--popover"),
    watermark: resolveColor("--foreground", 0.045),
    up: resolveColor("--up"),
    down: resolveColor("--down"),
    upVol: resolveColor("--up", 0.28),
    downVol: resolveColor("--down", 0.28),
    // Canvas can't resolve var(); use the body's computed stack (Inter via next/font).
    font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  }
}

const toTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp

function decimalsOf(step: string) {
  const i = step.indexOf(".")
  return i === -1 ? 0 : step.replace(/0+$/, "").length - i - 1
}

export default function PriceChart({ market, candles, className }: { market: MarketInfo; candles: Candle[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const price = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null)
  const watermark = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const loaded = useRef<{ symbol: string; first: number; count: number } | null>(null)
  const { resolvedTheme } = useTheme()
  const [hover, setHover] = useState<number | null>(null)

  const byTime = useMemo(() => new Map(candles.map((c) => [toTime(c.openTime), c])), [candles])

  // Create once per market.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const precision = Math.min(market.pricePrecision, decimalsOf(market.tickSize) || market.pricePrecision)
    const pal = readPalette()
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: pal.text, fontFamily: pal.font, fontSize: 11, attributionLogo: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { style: LineStyle.Dashed, width: 1 },
        horzLine: { style: LineStyle.Dashed, width: 1 },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      // Fixed, readable bar width: a short history stays as normal candles instead of stretching.
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9, minBarSpacing: 3 },
      grid: { vertLines: { visible: false }, horzLines: { visible: true } },
      localization: { priceFormatter: (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision }) },
    })
    price.current = c.addSeries(CandlestickSeries, {
      priceFormat: { type: "price", precision, minMove: Number(market.tickSize) || 10 ** -precision },
      borderVisible: false,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
    })
    // Faint pair watermark behind the candles.
    watermark.current = createTextWatermark(c.panes()[0]!, {
      horzAlign: "center",
      vertAlign: "center",
      lines: [{ text: `${market.baseAsset}/${market.quoteAsset}`, color: pal.watermark, fontSize: 64, fontFamily: pal.font, fontStyle: "600" }],
    })
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false })
    const onMove = (p: MouseEventParams) => setHover(p.time ? (p.time as number) : null)
    c.subscribeCrosshairMove(onMove)
    chart.current = c
    loaded.current = null
    return () => {
      c.unsubscribeCrosshairMove(onMove)
      c.remove()
      chart.current = null
      price.current = null
      volume.current = null
      watermark.current = null
    }
  }, [market.symbol, market.baseAsset, market.quoteAsset, market.pricePrecision, market.tickSize])

  // Theme.
  useEffect(() => {
    const c = chart.current
    if (!c || !price.current) return
    const p = readPalette()
    c.applyOptions({
      layout: { textColor: p.text, fontFamily: p.font },
      grid: { horzLines: { color: p.grid } },
      crosshair: { vertLine: { labelBackgroundColor: p.label, color: p.crosshair }, horzLine: { labelBackgroundColor: p.label, color: p.crosshair } },
    })
    price.current.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down })
    watermark.current?.applyOptions({ lines: [{ text: `${market.baseAsset}/${market.quoteAsset}`, color: p.watermark, fontSize: 64, fontFamily: p.font, fontStyle: "600" }] })
    volume.current?.setData(candles.map((k) => ({ time: toTime(k.openTime), value: Number(k.baseVolume), color: Number(k.close) >= Number(k.open) ? p.upVol : p.downVol })))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recolour on theme or market change; data effect below handles new candles
  }, [resolvedTheme, market.symbol])

  // Data: full reset on a new series, incremental update for the live candle.
  useEffect(() => {
    const ps = price.current
    const vs = volume.current
    if (!ps || !vs) return
    const p = readPalette()
    const bar = (k: Candle) => ({ time: toTime(k.openTime), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close) })
    const vol = (k: Candle) => ({ time: toTime(k.openTime), value: Number(k.baseVolume), color: Number(k.close) >= Number(k.open) ? p.upVol : p.downVol })
    const prev = loaded.current
    const first = candles[0]?.openTime ?? 0
    const incremental = prev && prev.symbol === market.symbol && prev.first === first && (candles.length === prev.count || candles.length === prev.count + 1)
    if (incremental && candles.length > 0) {
      const last = candles[candles.length - 1]!
      if (candles.length === prev.count + 1 && candles.length > 1) {
        const before = candles[candles.length - 2]!
        ps.update(bar(before))
        vs.update(vol(before))
      }
      ps.update(bar(last))
      vs.update(vol(last))
    } else {
      ps.setData(candles.map(bar))
      vs.setData(candles.map(vol))
      // Fit long histories; keep the default bar width (anchored right) for short ones.
      if (!prev || prev.symbol !== market.symbol) {
        const ts = chart.current?.timeScale()
        if (candles.length > 120) ts?.fitContent()
        else ts?.scrollToRealTime()
      }
    }
    loaded.current = { symbol: market.symbol, first, count: candles.length }
  }, [candles, market.symbol])

  const shown = (hover !== null ? byTime.get(hover as UTCTimestamp) : undefined) ?? candles[candles.length - 1]
  const p = market.pricePrecision
  const up = shown ? Number(shown.close) >= Number(shown.open) : true

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      {shown ? (
        <div className="num pointer-events-none absolute top-2 left-2 z-10 flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-background/30 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-md" aria-hidden="true">
          <span>{formatDateTime(shown.openTime)}</span>
          {(["open", "high", "low", "close"] as const).map((k) => (
            <span key={k}>
              {k[0]!.toUpperCase()} <span className={up ? "text-up" : "text-down"}>{formatAmount(shown[k], p)}</span>
            </span>
          ))}
          <span>
            V <span className="text-foreground">{formatCompact(shown.baseVolume)}</span>
          </span>
        </div>
      ) : null}
      <div ref={container} className="absolute inset-0" role="img" aria-label={`${market.baseAsset}/${market.quoteAsset} candlestick chart`} />
    </div>
  )
}
