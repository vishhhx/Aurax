"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { AnimatedMorphingIcon, zapIcon, shieldIcon, lockIcon } from "@/components/morphing-icon"
import { SunIcon, MoonIcon, ShieldAlertIcon, MenuIcon } from "lucide-react"

export default function Navbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Connection status state for morphing icon
  const [statusIdx, setStatusIdx] = useState(1) // Starts at 1: shieldIcon (Secured)

  // Mount check for next-themes hydration safety
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-cycle the connection status icon slowly to demonstrate morphing
  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % 3)
    }, 15000) // cycle every 15s
    return () => clearInterval(timer)
  }, [])

  const getStatusText = () => {
    if (statusIdx === 0) return "Node: High Speed"
    if (statusIdx === 1) return "Node: Secured"
    return "Node: Encrypted"
  }

  const getStatusColor = () => {
    if (statusIdx === 0) return "text-amber-400 bg-amber-500/5 border-amber-500/10"
    if (statusIdx === 1) return "text-emerald-400 bg-emerald-500/5 border-emerald-500/10"
    return "text-indigo-400 bg-indigo-500/5 border-indigo-500/10"
  }

  const icons = [zapIcon, shieldIcon, lockIcon]

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
              Aurax
            </span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
              Exchange
            </span>
          </Link>

          <div className="hidden items-center gap-5 text-xs font-medium text-muted-foreground md:flex">
            <Link href="/" className="hover:text-foreground transition-colors text-foreground font-semibold">
              Dashboard
            </Link>
            <Link href="/trade" className="hover:text-foreground transition-colors">
              Markets
            </Link>
            <Link href="/learn" className="hover:text-foreground transition-colors">
              Launchpad
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Docs
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Interactive Connection Status Badge */}
          <button
            onClick={() => setStatusIdx((prev) => (prev + 1) % 3)}
            title="Click to toggle connection node status"
            className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-300 cursor-pointer ${getStatusColor()}`}
          >
            <AnimatedMorphingIcon
              icons={icons}
              current={statusIdx}
              size={13}
              color="currentColor"
              duration={500}
            />
            <span className="hidden sm:inline transition-opacity duration-300">{getStatusText()}</span>
          </button>

          {/* Theme Toggle Button */}
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="rounded-lg border border-border/40 bg-card/20 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
              title="Toggle theme (Hotkey: D)"
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </button>
          )}

          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-emerald-500/10 transition-all border border-emerald-400/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  )
}
