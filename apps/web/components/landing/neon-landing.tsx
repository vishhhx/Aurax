"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ArrowRightIcon, ZapIcon } from "lucide-react"

import { useCandles, useConnectionState, useOrderBook, useRecentTrades } from "@/hooks/useMarketData"
import { useLandingMarkets } from "@/hooks/useLandingMarkets"
import { useAppSelector } from "@/hooks/useRedux"
import { selectIsAuthenticated } from "@/store/slices/authSlice"
import { formatCompactNumber, formatDecimal, type CandleView } from "@/lib/market-client"
import { PriceChange, Sparkline } from "@/components/market/market-primitives"
import s from "./neon.module.css"

const RIM_VIDEO = "/media/rim-glow.mp4"

const VIDEO_QUERY = "(min-width: 900px) and (prefers-reduced-motion: no-preference)"

/** Static procedural starfield; nothing in the sky animates in code. */
function Stars() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const paint = () => {
      const dpr = window.devicePixelRatio || 1
      c.width = innerWidth * dpr
      c.height = innerHeight * dpr
      const g = c.getContext("2d")!
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < (innerWidth * innerHeight) / 2600; i++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.7})`
        g.beginPath()
        g.arc(rnd() * c.width, rnd() * c.height, (rnd() * 1.1 + 0.2) * dpr, 0, Math.PI * 2)
        g.fill()
      }
    }
    paint()
    addEventListener("resize", paint)
    return () => removeEventListener("resize", paint)
  }, [])
  return <canvas ref={ref} className={s.stars} aria-hidden="true" />
}

function Sky() {
  const [ready, setReady] = useState(false)
  // Desktop with motion allowed only; the server render and phones keep the painted rim.
  const video = useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(VIDEO_QUERY)
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => matchMedia(VIDEO_QUERY).matches,
    () => false,
  )
  return (
    <div className={s.sky} aria-hidden="true">
      <Stars />
      <div className={s.rim} />
      {video && (
        <video className={s.rimVideo} data-ready={ready} src={RIM_VIDEO} autoPlay muted loop playsInline onCanPlay={() => setReady(true)} />
      )}
    </div>
  )
}

function AreaChart({ candles }: { candles: CandleView[] }) {
  const closes = candles.map((c) => Number(c.close))
  if (closes.length < 2) return <div className={s.empty}>No trades in this window yet</div>
  const min = Math.min(...closes), max = Math.max(...closes), r = max - min || 1
  const pts = closes.map((v, i) => `${(i / (closes.length - 1)) * 100},${38 - ((v - min) / r) * 34}`)
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={s.chart} role="img" aria-label="Price over recent 1-minute candles">
      <defs>
        <linearGradient id="nv-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9312ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9312ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${pts.join(" ")} 100,40`} fill="url(#nv-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#b56bff" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Panel() {
  const { rows, state } = useLandingMarkets()
  const conn = useConnectionState()
  const [picked, setPicked] = useState<string | null>(null)
  // Default to the market with the most real 24h volume.
  const symbol = useMemo(() => {
    if (picked) return picked
    const best = [...rows].sort((a, b) => Number(b.ticker?.quoteVolume ?? 0) - Number(a.ticker?.quoteVolume ?? 0))[0]
    return best?.market.symbol ?? null
  }, [rows, picked])
  const row = rows.find((r) => r.market.symbol === symbol)
  const pp = row?.market.pricePrecision ?? 2
  const { candles } = useCandles(symbol, "1m", 60)
  const book = useOrderBook(symbol)
  const { trades } = useRecentTrades(symbol, 8)

  const totals = rows.reduce(
    (t, r) => ({ vol: t.vol + Number(r.ticker?.quoteVolume ?? 0), trades: t.trades + (r.ticker?.tradeCount ?? 0) }),
    { vol: 0, trades: 0 },
  )
  const quote = row?.market.quoteAsset ?? ""
  // Only label an exchange-wide sum with a unit when every market shares that quote asset.
  const quotes = new Set(rows.map((r) => r.market.quoteAsset))
  const totalUnit = quotes.size === 1 ? ` ${[...quotes][0]}` : ""

  return (
    <section className={s.panel} aria-label="Live exchange data">
      <aside className={s.side}>
        <div className={s.sideHead}>
          <span>Markets</span>
          <span className={s.conn} data-state={conn}>{conn}</span>
        </div>
        {state === "error" && <div className={s.empty}>Market service unavailable</div>}
        {state === "loading" && <div className={s.empty}>Loading markets…</div>}
        {rows.map((r) => (
          <button key={r.market.symbol} className={s.mkt} data-active={r.market.symbol === symbol} onClick={() => setPicked(r.market.symbol)}>
            <span className={s.mktSym}>{r.market.baseAsset}<small>/{r.market.quoteAsset}</small></span>
            <span className={s.mktPx}>{r.ticker?.lastPrice ? formatDecimal(r.ticker.lastPrice, r.market.pricePrecision) : "—"}</span>
            <PriceChange value={r.ticker?.priceChangePercent ?? null} className={s.mktChg} />
          </button>
        ))}
      </aside>

      <div className={s.main}>
        <div className={s.stats}>
          <Stat label={`${row?.market.baseAsset ?? "—"} last price`} value={row?.ticker?.lastPrice ? formatDecimal(row.ticker.lastPrice, pp) : "—"} extra={<PriceChange value={row?.ticker?.priceChangePercent ?? null} />} />
          <Stat label="24h volume" value={row?.ticker ? `${formatCompactNumber(row.ticker.quoteVolume)} ${quote}` : "—"} />
          <Stat label="24h trades · all markets" value={totals.trades.toLocaleString()} />
          <Stat label="24h volume · all markets" value={quotes.size > 1 ? "mixed quotes" : `${formatCompactNumber(String(totals.vol))}${totalUnit}`} />
        </div>
        <div className={s.chartBox}>
          <div className={s.boxHead}>
            <span>{symbol ?? "—"} · 1m</span>
            {row && <Sparkline points={row.spark} width={64} height={18} />}
          </div>
          <AreaChart candles={candles} />
        </div>
      </div>

      <div className={s.right}>
        <div className={s.boxHead}><span>Order book</span><span className={s.muted}>seq {book.sequenceNumber ?? "—"}</span></div>
        <div className={s.book}>
          {[...book.asks.slice(0, 5)].reverse().map((l) => (
            <div key={`a${l.price}`} className={s.lvl}><span className={s.red}>{formatDecimal(l.price, pp)}</span><span>{l.quantity}</span></div>
          ))}
          <div className={s.mid} />
          {book.bids.slice(0, 5).map((l) => (
            <div key={`b${l.price}`} className={s.lvl}><span className={s.green}>{formatDecimal(l.price, pp)}</span><span>{l.quantity}</span></div>
          ))}
          {!book.asks.length && !book.bids.length && <div className={s.empty}>Order book is empty</div>}
        </div>
        <div className={s.boxHead}><span>Recent trades</span></div>
        <div className={s.book}>
          {trades.slice(0, 6).map((t) => (
            <div key={t.tradeId} className={s.lvl}>
              <span className={t.side === "BUY" ? s.green : s.red}>{formatDecimal(t.price, pp)}</span>
              <span>{t.quantity}</span>
              <span className={s.muted}>{new Date(t.executedAt).toLocaleTimeString("en-GB")}</span>
            </div>
          ))}
          {!trades.length && <div className={s.empty}>No trades yet</div>}
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className={s.stat}>
      <span className={s.muted}>{label}</span>
      <strong>{value}</strong>
      {extra}
    </div>
  )
}

export function NeonLanding() {
  const authed = useAppSelector(selectIsAuthenticated)
  const { rows } = useLandingMarkets()
  const firstSymbol = rows[0]?.market.symbol
  const tradeHref = firstSymbol ? `/trade/${firstSymbol}` : "/dashboard"

  return (
    <div className={s.page}>
      <Sky />
      <nav className={s.nav}>
        <Link href="/" className={s.logo}><ZapIcon aria-hidden="true" /> Aurax</Link>
        <div className={s.links}>
          <Link href="/" data-active="true">Home</Link>
          <Link href={tradeHref}>Trade</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
        <Link href={authed ? "/dashboard" : "/register"} className={s.btn}>{authed ? "Dashboard" : "Get Started"}</Link>
      </nav>

      <header className={s.hero}>
        <h1 className={s.h1}>
          <span className={s.line}><span className={s.grad}>Aurax</span> Trade Crypto,</span>
          <span className={s.line}>On Live Order Books.</span>
        </h1>
        <p className={s.lede}>
          Spot markets running on the Aurax matching engine. Every price, book and trade below is streamed from the exchange right now.
        </p>
        <div className={s.ctas}>
          <Link href={authed ? tradeHref : "/register"} className={s.btn}>
            {authed ? "Start trading" : "Get Started"} <ArrowRightIcon aria-hidden="true" />
          </Link>
          <Link href={authed ? "/dashboard" : "/login"} className={s.btnGhost}>{authed ? "Dashboard" : "Log in"}</Link>
        </div>
      </header>

      <div className={s.panelWrap}>
        <div className={s.panelGlow} aria-hidden="true" />
        <Panel />
      </div>
    </div>
  )
}
