"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { useAuth } from "@/hooks/use-account"
import { useMarkets } from "@/hooks/use-market-data"
import { LandingNav } from "./landing-nav"

const HERO_VIDEO = "/media/hero-bg.mp4"
const HERO_POSTER = "/media/hero-bg-poster.jpg"
const HERO_DASHBOARD = "/brand/hero-dashboard.png"

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reduce = useReducedMotion()
  const { isAuthenticated } = useAuth()
  const { markets } = useMarkets()

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -200])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const dashboardY = useTransform(scrollYProgress, [0, 1], [0, -250])

  // Respect reduced motion: show the poster frame instead of a moving background.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (reduce) v.pause()
    else void v.play().catch(() => {})
  }, [reduce])

  const cta = isAuthenticated ? { href: markets[0] ? `/trade/${markets[0].symbol}` : "/trade", label: "Open the Terminal" } : { href: "/register", label: "Get Started for Free" }

  return (
    <section ref={sectionRef} aria-labelledby="hero-title" className="relative min-h-svh overflow-hidden">
      <LandingNav />

      <motion.div style={reduce ? undefined : { y: contentY, opacity: contentOpacity }} className="relative z-20 mt-16 flex flex-col items-center px-4 text-center md:mt-20">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0 }} className="liquid-glass mb-6 flex items-center gap-2 rounded-lg px-3 py-2">
          <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-medium text-background">New</span>
          <span className="text-sm font-medium text-muted-foreground">Say Hello to Aurax Engine v3.2</span>
        </motion.div>

        <motion.h1
          id="hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-3 text-5xl leading-tight font-medium tracking-[-2px] md:text-7xl md:leading-[1.15]"
        >
          Your Markets.
          <br />
          One Clear <span className="font-serif font-normal italic">Overview</span>.
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-8 text-lg leading-6 font-normal text-(--hero-subtitle) opacity-90">
          Aurax helps traders track prices, orders,
          <br />
          and fills with precision.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
          <motion.span className="inline-block" whileHover={reduce ? undefined : { scale: 1.03 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
            <Link
              href={cta.href}
              className="inline-block rounded-full bg-foreground px-8 py-3.5 text-base font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {cta.label}
            </Link>
          </motion.span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="relative mt-14 w-screen"
        style={{ marginLeft: "calc(-50vw + 50%)", aspectRatio: "16 / 9" }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay={!reduce}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-start justify-center pt-[6%]">
          <motion.img
            src={HERO_DASHBOARD}
            alt="The Aurax trading terminal: candlestick chart, live order book and order form"
            style={{ y: reduce ? 0 : dashboardY, mixBlendMode: "luminosity" }}
            className="w-[90%] max-w-5xl rounded-2xl shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
          />
        </div>
      </motion.div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-40 bg-gradient-to-t from-background to-transparent" />
    </section>
  )
}
