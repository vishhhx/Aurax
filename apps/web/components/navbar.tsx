"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { AnimatedMorphingIcon, zapIcon, shieldIcon, lockIcon } from "@/components/morphing-icon"
import { SunIcon, MoonIcon, LogOut, LayoutDashboard } from "lucide-react"
import { useAppSelector, useAppDispatch } from "@/hooks/useRedux"
import { selectIsAuthenticated, signOut } from "@/store/slices/authSlice"

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function Navbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [statusIdx, setStatusIdx] = useState(1)
  const router = useRouter()
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const user = useAppSelector((s) => s.auth.user)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % 3)
    }, 15000)
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

  const handleLogout = () => {
    void dispatch(signOut())
    router.replace("/login")
  }

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
          {/* Connection Status Badge */}
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

          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="rounded-lg border border-border/40 bg-card/20 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
              title="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </button>
          )}

          {/* Auth section */}
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <LayoutDashboard className="size-3.5" />
                Dashboard
              </Link>
              {/* User avatar with initials */}
              <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/20 px-2.5 py-1.5">
                <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-400">
                  {getInitials(user.name)}
                </div>
                <span className="text-xs font-medium hidden lg:block max-w-24 truncate">{user.name}</span>
              </div>
              <button
                id="nav-btn-logout"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/20 p-1.5 text-muted-foreground hover:text-rose-400 hover:border-rose-400/30 transition-all cursor-pointer"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-emerald-500/10 transition-all border border-emerald-400/20"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
