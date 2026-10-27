"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
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
import { Skeleton } from "@/components/ui/skeleton"
import { DepositDialog } from "@/components/deposit-dialog"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import {
  selectIsAuthenticated,
  selectIsSessionLoading,
  signOut,
} from "@/store/slices/authSlice"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/#markets", label: "Markets" },
  { href: "/#trade", label: "Trade" },
  { href: "/#features", label: "Why Aurax" },
] as const

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
    >
      <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" priority />
      <span className="text-lg font-bold tracking-tight">Aurax</span>
      <span className="sr-only">Exchange home</span>
    </Link>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Both icons render and CSS picks one, so there is no hydration mismatch
  // and no "mounted" flicker.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle color theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  )
}

function UserMenu() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const user = useAppSelector((s) => s.auth.user)

  if (!user) return null

  const handleLogout = () => {
    void dispatch(signOut())
    router.replace("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open account menu" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary-emphasis">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="truncate text-sm font-semibold text-foreground">{user.name}</span>
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
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          {NAV_LINKS.map((l) => (
            <DropdownMenuItem key={l.href} asChild>
              <Link href={l.href}>{l.label}</Link>
            </DropdownMenuItem>
          ))}
          {isAuthenticated ? (
            <DropdownMenuItem asChild>
              <Link href="/dashboard">Dashboard</Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const isSessionLoading = useAppSelector(selectIsSessionLoading)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <BrandLogo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <Button key={l.href} asChild variant="ghost" className="text-muted-foreground">
                <Link href={l.href}>{l.label}</Link>
              </Button>
            ))}
            {isAuthenticated ? (
              <Button
                asChild
                variant="ghost"
                className={cn(pathname === "/dashboard" ? "text-foreground" : "text-muted-foreground")}
              >
                <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>
                  Dashboard
                </Link>
              </Button>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {isSessionLoading ? (
            <Skeleton className="h-8 w-28 rounded-lg" />
          ) : isAuthenticated ? (
            <>
              <DepositDialog />
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
          <MobileNav isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </header>
  )
}
