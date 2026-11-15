"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowDownToLineIcon,
  BellIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  WalletIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrandLogo } from "@/components/common/brand"
import { useAuth } from "@/hooks/use-account"
import { useConnection, useMarkets } from "@/hooks/use-market-data"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { signOut } from "@/store/slices/auth"
import { markAllRead } from "@/store/slices/notifications"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function useNavLinks(authenticated: boolean) {
  const { markets } = useMarkets()
  const tradeHref = markets[0] ? `/trade/${markets[0].symbol}` : "/trade"
  return [
    { href: "/markets", label: "Markets", match: "/markets" },
    { href: tradeHref, label: "Trade", match: "/trade" },
    ...(authenticated
      ? [
          { href: "/dashboard", label: "Dashboard", match: "/dashboard" },
          { href: "/wallet", label: "Wallet", match: "/wallet" },
          { href: "/orders", label: "Orders", match: "/orders" },
        ]
      : []),
  ]
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle colour theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle theme (D)</TooltipContent>
    </Tooltip>
  )
}

const CONNECTION_LABEL = {
  idle: "Not connected",
  connecting: "Connecting",
  connected: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
} as const

/** Real-time feed status, always visible. */
export function ConnectionIndicator({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { state } = useConnection()
  const dot = state === "connected" ? "bg-up" : state === "offline" ? "bg-down" : "bg-warning animate-pulse"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
          <span className={withLabel ? undefined : "sr-only"}>{CONNECTION_LABEL[state]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>Market data: {CONNECTION_LABEL[state]}</TooltipContent>
    </Tooltip>
  )
}

function NotificationsMenu() {
  const dispatch = useAppDispatch()
  const { items, unread } = useAppSelector((s) => s.notifications)
  return (
    <Popover onOpenChange={(open) => open && unread > 0 && dispatch(markAllRead())}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <BellIcon />
          {unread > 0 ? <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Activity</p>
          <Link href="/account/notifications" className="text-xs text-muted-foreground hover:text-foreground">
            Settings
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Order, fill and deposit events from this session appear here.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href ?? "#"} className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted">
                  <span className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className={cn(n.tone === "error" && "text-down", n.tone === "success" && "text-up")}>{n.title}</span>
                    <span className="num shrink-0 font-normal text-muted-foreground">{formatTime(n.at)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{n.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}

function UserMenu() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user } = useAuth()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="rounded-full">
          <Avatar className="size-7">
            <AvatarFallback className="bg-muted text-[11px] font-semibold">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <LayoutDashboardIcon />
              Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/wallet">
              <WalletIcon />
              Wallet
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/orders">
              <ListOrderedIcon />
              Orders
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account">
              <SettingsIcon />
              Account settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              void dispatch(signOut()).then(() => router.replace("/login"))
            }}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav({ links, authenticated }: { links: ReturnType<typeof useNavLinks>; authenticated: boolean }) {
  const pathname = usePathname()
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className={cn("rounded-md px-3 py-2.5 text-sm hover:bg-muted", pathname.startsWith(l.match) && "bg-muted font-medium")}>
              {l.label}
            </Link>
          ))}
          <Separator className="my-2" />
          {authenticated ? (
            <>
              <Link href="/wallet/deposit" className="rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                Deposit
              </Link>
              <Link href="/account" className="rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                Account settings
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                Log in
              </Link>
              <Link href="/register" className="rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                Create account
              </Link>
            </>
          )}
          <div className="flex items-center justify-between px-3 py-2.5">
            <ConnectionIndicator withLabel />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

export function SiteHeader({ className }: { className?: string }) {
  const pathname = usePathname()
  const { isAuthenticated, isPending } = useAuth()
  const links = useNavLinks(isAuthenticated)

  return (
    <header className={cn("sticky top-0 z-40 border-b bg-background/40 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_-1px_0_0_var(--glass-highlight)]", className)}>
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <BrandLogo />
          <nav aria-label="Main" className="liquid-glass hidden items-center gap-0.5 rounded-full p-1 md:flex">
            {links.map((l) => {
              const active = pathname.startsWith(l.match)
              return (
                <Link
                  key={l.label}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground", active && "text-foreground")}
                >
                  {active ? <motion.span layoutId="nav-active" aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground/10 shadow-[inset_0_1px_0_0_var(--glass-highlight)]" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} /> : null}
                  <span className="relative">{l.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ConnectionIndicator className="mr-1 hidden sm:inline-flex" />
          <ThemeToggle />
          {isPending ? (
            <Skeleton className="h-8 w-24" />
          ) : isAuthenticated ? (
            <>
              <NotificationsMenu />
              <Button asChild size="sm" className="ml-1 hidden rounded-full sm:inline-flex">
                <Link href="/wallet/deposit">
                  <ArrowDownToLineIcon data-icon="inline-start" />
                  Deposit
                </Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in</Link>
              </Button>
              <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
          <MobileNav links={links} authenticated={isAuthenticated} />
        </div>
      </div>
    </header>
  )
}
