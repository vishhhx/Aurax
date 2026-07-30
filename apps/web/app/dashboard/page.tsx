"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Wallet,
  User,
  LogOut,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ShieldCheck,
  BarChart3,
  Coins,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { signOut } from "@/store/slices/authSlice"
import { fetchWalletAssets } from "@/store/slices/walletSlice"
import type { WalletAsset } from "@/store/slices/walletSlice.types"
import { useTheme } from "next-themes"
import { SunIcon, MoonIcon } from "lucide-react"
import { DepositDialog } from "@/components/deposit-dialog"

function formatBalance(val: string | number, decimals = 8) {
  const n = typeof val === "string" ? parseFloat(val) : val
  if (n === 0) return "0.00"
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// Skeleton loader row
function AssetSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-xl border border-border/30 bg-card/20 p-4">
      <div className="size-10 rounded-full bg-muted/40" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded bg-muted/40" />
        <div className="h-2.5 w-16 rounded bg-muted/30" />
      </div>
      <div className="space-y-2 text-right">
        <div className="ml-auto h-3 w-20 rounded bg-muted/40" />
        <div className="ml-auto h-2.5 w-14 rounded bg-muted/30" />
      </div>
    </div>
  )
}

// Single Asset row
function AssetRow({ asset }: { asset: WalletAsset }) {
  const available =
    typeof asset.availableBalance === "string"
      ? parseFloat(asset.availableBalance)
      : asset.availableBalance
  const locked =
    typeof asset.lockedBalance === "string"
      ? parseFloat(asset.lockedBalance)
      : asset.lockedBalance
  const hasBalance = available > 0 || locked > 0

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border/30 bg-card/20 p-4 transition-all duration-200 hover:border-border/60 hover:bg-card/40 hover:shadow-sm">
      {/* Asset Icon / Placeholder */}
      <div className="relative shrink-0">
        {asset.imageUrl ? (
          <img
            src={asset.imageUrl}
            alt={asset.symbol}
            className="size-10 rounded-full border border-border/30 object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = ""
            }}
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full border border-border/30 bg-muted/40 text-xs font-bold text-muted-foreground">
            {asset.symbol.slice(0, 2)}
          </div>
        )}
        {!asset.depositEnabled && (
          <div
            className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border border-background bg-rose-500/80"
            title="Deposit disabled"
          />
        )}
      </div>

      {/* Asset Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{asset.symbol}</span>
          {asset.network && (
            <Badge
              variant="outline"
              className="border-border/50 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            >
              {asset.network}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {asset.name}
        </p>
      </div>

      {/* Balance */}
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${hasBalance ? "text-foreground" : "text-muted-foreground/50"}`}
        >
          {formatBalance(available)}
        </p>
        {locked > 0 && (
          <p className="mt-0.5 text-[11px] text-amber-400/80 tabular-nums">
            {formatBalance(locked)} locked
          </p>
        )}
        {!hasBalance && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/40">
            No balance
          </p>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth()
  const user = useAppSelector((s) => s.auth.user)
  const {
    assets,
    isLoading: walletLoading,
    error: walletError,
  } = useAppSelector((s) => s.wallet)

  // Load wallet assets once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log("is auth true")
      dispatch(fetchWalletAssets())
    }
  }, [isAuthenticated, dispatch])

  const auth = useAppSelector((s) => s.auth)

  console.log("Dashboard:", auth)

  const handleLogout = () => {
    void dispatch(signOut())
    router.replace("/login")
  }

  const handleRefreshAssets = () => {
    dispatch(fetchWalletAssets())
  }

  const totalBalance = assets.reduce((sum, a) => {
    return (
      sum +
      (typeof a.availableBalance === "string"
        ? parseFloat(a.availableBalance)
        : a.availableBalance)
    )
  }, 0)

  const assetsWithBalance = assets.filter((a) => {
    const v =
      typeof a.availableBalance === "string"
        ? parseFloat(a.availableBalance)
        : a.availableBalance
    return v > 0
  })

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-emerald-400" />
          <p className="text-sm text-muted-foreground">
            Loading your dashboard…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ─── Topbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2">
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500 bg-clip-text text-xl font-bold text-transparent transition-opacity group-hover:opacity-80">
              Aurax
            </span>
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
              Exchange
            </span>
          </Link>

          {/* Nav */}
          <nav className="hidden items-center gap-5 text-xs font-medium text-muted-foreground md:flex">
            <Link href="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <Link href="/dashboard" className="font-semibold text-foreground">
              Dashboard
            </Link>
            <Link
              href="/trade"
              className="transition-colors hover:text-foreground"
            >
              Markets
            </Link>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <DepositDialog />

            {/* Theme toggle */}
            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="cursor-pointer rounded-lg border border-border/40 bg-card/20 p-1.5 text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
              title="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </button>

            {/* User avatar */}
            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/20 px-3 py-1.5">
              <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                {user ? getInitials(user.name) : "?"}
              </div>
              <span className="hidden text-xs font-medium sm:block">
                {user?.name ?? "User"}
              </span>
            </div>

            {/* Logout */}
            <Button
              id="btn-logout"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2 border-border/60 text-muted-foreground transition-all hover:border-rose-400/40 hover:text-rose-400"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        {/* Welcome banner */}
        <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-emerald-500/5 via-card/20 to-indigo-500/5 p-6 backdrop-blur-sm md:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Welcome back
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                {user?.name ?? "Trader"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="size-3" />
                  {user?.email}
                </span>
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[11px] text-emerald-400"
                >
                  <ShieldCheck className="size-3" />
                  {user?.provider === "google"
                    ? "Google"
                    : user?.provider === "github"
                      ? "GitHub"
                      : "Email"}{" "}
                  Account
                </Badge>
                {user?.isEmailVerified && (
                  <Badge
                    variant="outline"
                    className="border-blue-500/30 bg-blue-500/5 text-[11px] text-blue-400"
                  >
                    Verified
                  </Badge>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Portfolio Value</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {assetsWithBalance.length > 0 ? (
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                    {totalBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span className="text-2xl text-muted-foreground/50">—</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Total across all assets
              </p>
            </div>
          </div>
        </section>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              label: "Total Assets",
              value: assets.length.toString(),
              icon: <Coins className="size-4 text-emerald-400" />,
              sub: "listed on Aurax",
            },
            {
              label: "Active Balances",
              value: assetsWithBalance.length.toString(),
              icon: <Wallet className="size-4 text-blue-400" />,
              sub: "with holdings",
            },
            {
              label: "Account Status",
              value: "Active",
              icon: <ShieldCheck className="size-4 text-emerald-400" />,
              sub: "all systems normal",
            },
            {
              label: "Last Login",
              value: user?.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "Today",
              icon: <Clock className="size-4 text-muted-foreground" />,
              sub: user?.lastLogin
                ? new Date(user.lastLogin).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="space-y-3 rounded-xl border border-border/30 bg-card/20 p-4 transition-colors hover:bg-card/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {stat.label}
                </p>
                {stat.icon}
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
                {stat.sub && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stat.sub}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Assets Table */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Assets & Balances</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                All platform assets with your current holdings
              </p>
            </div>
            <Button
              id="btn-refresh-assets"
              variant="outline"
              size="sm"
              onClick={handleRefreshAssets}
              disabled={walletLoading}
              className="gap-2 border-border/60 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={`size-3.5 ${walletLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          {/* Error state */}
          {walletError && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <span>Failed to load assets: {walletError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAssets}
                className="ml-auto border-rose-500/30 text-rose-400"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Loading skeletons */}
          {walletLoading && !walletError && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <AssetSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Assets list */}
          {!walletLoading && !walletError && assets.length > 0 && (
            <div className="space-y-2.5">
              {/* Assets with balance first */}
              {assetsWithBalance.length > 0 && (
                <>
                  <p className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Your Holdings
                  </p>
                  {assetsWithBalance.map((asset) => (
                    <AssetRow key={asset.assetId} asset={asset} />
                  ))}
                  <div className="my-4 border-t border-border/30" />
                  <p className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    All Assets
                  </p>
                </>
              )}

              {assets
                .filter((a) => {
                  const v =
                    typeof a.availableBalance === "string"
                      ? parseFloat(a.availableBalance)
                      : a.availableBalance
                  return v === 0
                })
                .map((asset) => (
                  <AssetRow key={asset.assetId} asset={asset} />
                ))}
            </div>
          )}

          {/* Empty state */}
          {!walletLoading && !walletError && assets.length === 0 && (
            <div className="space-y-3 rounded-xl border border-border/30 bg-card/20 p-10 text-center">
              <div className="flex justify-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/30">
                  <Coins className="size-6 text-muted-foreground/50" />
                </div>
              </div>
              <h3 className="font-semibold">No assets found</h3>
              <p className="text-sm text-muted-foreground">
                Your wallet is empty or no assets are listed yet.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
