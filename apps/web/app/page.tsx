"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import Navbar from "@/components/navbar"
import LiveExchange from "@/components/live-exchange"
import { AnimatedMorphingIcon, zapIcon, shieldIcon, lockIcon } from "@/components/morphing-icon"
import { ArrowUpRightIcon, ArrowDownRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Types for Tickers
type TickerInfo = {
  symbol: string
  name: string
  price: number
  prevPrice: number
  change: number
}

export default function Page() {
  // Set document title for SEO
  useEffect(() => {
    document.title = "Aurax Exchange | Advanced Centralized Trading Platform"
  }, [])

  // Tickers State for Marquee
  const [tickers, setTickers] = useState<TickerInfo[]>([
    { symbol: "BTC", name: "Bitcoin", price: 98432.1, prevPrice: 98432.1, change: 1.45 },
    { symbol: "ETH", name: "Ethereum", price: 3452.8, prevPrice: 3452.8, change: -0.78 },
    { symbol: "SOL", name: "Solana", price: 242.15, prevPrice: 242.15, change: 5.62 },
    { symbol: "AURX", name: "Aurax Token", price: 12.34, prevPrice: 12.34, change: 2.3 },
  ])

  // Interactive Security Card State (Index 0: Speed/Zap, 1: Security/Shield, 2: Reliability/Lock)
  const [featureIdx, setFeatureIdx] = useState(1)

  const featureIcons = [zapIcon, shieldIcon, lockIcon]

  const featureDetails = [
    {
      title: "Ultra-Fast Execution",
      description: "Aurax operates a custom matching engine that achieves trade execution speeds under 500 microseconds. Process up to 500,000 transactions per second with near-zero latency, even during peak market volatility.",
      badge: "High Speed",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "Bank-Grade Custody",
      description: "Your digital assets are safe with us. We utilize geographically distributed multi-signature vaults, hardware security modules (HSMs), and keep 98% of trader funds in air-gapped cold storage with audited proof-of-reserves.",
      badge: "Institutional Security",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Zero-Downtime Guarantee",
      description: "Our microservices-based matching node is distributed across redundant server networks globally. In the event of a regional cloud outage, traffic is seamlessly re-routed to ensure 24/7 uninterrupted operation.",
      badge: "High Availability",
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
  ]

  // Dynamic Ticker Fluctuation Interval
  useEffect(() => {
    const interval = setInterval(() => {
      setTickers((prev) =>
        prev.map((t) => {
          const changePct = (Math.random() - 0.5) * 0.04
          const priceChange = t.price * changePct
          const nextPrice = Number((t.price + priceChange).toFixed(t.symbol === "BTC" ? 1 : 2))
          const initialBaseline = t.symbol === "BTC" ? 97000 : t.symbol === "ETH" ? 3480 : t.symbol === "SOL" ? 230 : 12.0
          const totalChangePercent = ((nextPrice - initialBaseline) / initialBaseline) * 100

          return {
            ...t,
            prevPrice: t.price,
            price: nextPrice,
            change: Number(totalChangePercent.toFixed(2)),
          }
        })
      )
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  // Callback when user executes a simulated trade
  const handleTradeExecuted = (trade: { side: "buy" | "sell"; price: number; size: number }) => {
    // Sync the local AURX price back to the marquee ticker list
    setTickers((prev) =>
      prev.map((t) => {
        if (t.symbol === "AURX") {
          return {
            ...t,
            prevPrice: t.price,
            price: trade.price,
          }
        }
        return t
      })
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans select-none antialiased">
      {/* Navigation Header */}
      <Navbar />

      {/* Ticker Tape Section */}
      <section aria-label="Live Market Prices" className="w-full border-b border-border/30 bg-muted/5 py-2 overflow-hidden shrink-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-none py-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-muted/40 px-2 py-0.5 rounded shrink-0">
              Live Tickers
            </span>
            <div className="flex gap-8 items-center w-full justify-between">
              {tickers.map((t) => {
                const isPriceUp = t.price >= t.prevPrice
                const isChangePositive = t.change >= 0
                return (
                  <div
                    key={t.symbol}
                    id={`ticker-${t.symbol.toLowerCase()}`}
                    className="flex items-center gap-2 text-xs shrink-0"
                  >
                    <span className="font-bold text-muted-foreground/80">{t.symbol}/USD</span>
                    <span className={`font-semibold transition-all duration-300 ${
                      t.price > t.prevPrice ? "text-emerald-400" : t.price < t.prevPrice ? "text-rose-400" : "text-foreground"
                    }`}>
                      ${t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className={`flex items-center text-[10px] font-semibold ${
                      isChangePositive ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {isChangePositive ? (
                        <ArrowUpRightIcon className="size-3" />
                      ) : (
                        <ArrowDownRightIcon className="size-3" />
                      )}
                      {isChangePositive ? "+" : ""}{t.change}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Console Layout */}
      <main id="main-content" className="flex-1 w-full mx-auto max-w-7xl px-4 sm:px-6 py-6 flex flex-col gap-8">
        {/* SEO Hidden H1 */}
        <h1 className="sr-only">Aurax Centralized Crypto Trading Exchange Terminal</h1>

        {/* Hero Pitch Summary */}
        <section aria-labelledby="hero-title" className="text-center py-2 flex flex-col gap-4 max-w-2xl mx-auto items-center">
          <h2 id="hero-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground/80 bg-clip-text text-transparent">
            Centralized Speed. Audited Security.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Trade AURX/USD and other major crypto asset pairs with absolute speed. Experience our high-performance matching node, interactive orderbooks, and real-time candlestick charts.
          </p>
          <div className="flex gap-3 mt-1.5">
            <Link
              href="/register"
              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4.5 py-2 text-xs font-semibold text-white shadow-md hover:shadow-emerald-500/10 transition-all border border-emerald-400/20 cursor-pointer"
            >
              Register Now
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border/40 bg-card/30 hover:bg-muted/50 px-4.5 py-2 text-xs font-semibold text-foreground transition-all cursor-pointer"
            >
              Sign In to Trade
            </Link>
          </div>
        </section>

        {/* Dashboard Panel */}
        <section aria-label="Trading Console" className="w-full">
          <LiveExchange onTradeExecuted={handleTradeExecuted} />
        </section>

        {/* Interactive Features & Skills Section */}
        <section aria-labelledby="features-heading" className="rounded-2xl border border-border/50 bg-card/10 p-6 md:p-8 backdrop-blur-md">
          <div className="grid gap-8 md:grid-cols-3 items-center">
            {/* Left: Heading & Selector */}
            <div className="md:col-span-1 flex flex-col gap-4">
              <div>
                <h3 id="features-heading" className="text-xl font-bold tracking-tight">Platform Standards</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Click a metric below to inspect our security, latency, and uptime compliance protocols.
                </p>
              </div>

              {/* Selectors */}
              <div className="flex flex-col gap-2">
                {featureDetails.map((f, i) => (
                  <button
                    key={f.title}
                    id={`feature-btn-${i}`}
                    onClick={() => setFeatureIdx(i)}
                    className={`flex items-center justify-between text-left p-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      featureIdx === i
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                        : "border-border/40 hover:border-border/80 hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{f.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-normal uppercase ${
                      featureIdx === i ? "border-emerald-500/20 text-emerald-400" : "border-border/60 text-muted-foreground"
                    }`}>
                      {i === 0 ? "Speed" : i === 1 ? "Vault" : "Node"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Active Detail Card with Giant Morphing Icon */}
            <div className="md:col-span-2 flex flex-col sm:flex-row items-center gap-6 rounded-xl border border-border/30 bg-muted/5 p-6 transition-all duration-300">
              {/* Giant Morphing Icon */}
              <div className="shrink-0 flex items-center justify-center size-28 rounded-2xl bg-card border border-border/40 text-emerald-400 shadow-md">
                <AnimatedMorphingIcon
                  icons={featureIcons}
                  current={featureIdx}
                  size={48}
                  color="currentColor"
                  duration={600}
                />
              </div>

              {/* Details */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] uppercase font-bold py-0.5 px-2 ${featureDetails[featureIdx].color}`}>
                    {featureDetails[featureIdx].badge}
                  </Badge>
                </div>
                <h4 className="text-base font-bold text-foreground">
                  {featureDetails[featureIdx].title}
                </h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {featureDetails[featureIdx].description}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="exchange-footer" className="w-full border-t border-border/30 bg-card/10 py-6 text-center text-xs text-muted-foreground mt-8 shrink-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Aurax Exchange</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-foreground transition-colors hover:underline">Terms of Service</a>
            <a href="/privacy" className="hover:text-foreground transition-colors hover:underline">Privacy Policy</a>
            <a href="/support" className="hover:text-foreground transition-colors hover:underline">Support Portal</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
