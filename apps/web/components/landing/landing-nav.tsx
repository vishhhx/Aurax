"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronDownIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuth } from "@/hooks/use-account"
import { useMarkets } from "@/hooks/use-market-data"

const linkClass = "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"

export function LandingNav() {
  const { isAuthenticated, isPending } = useAuth()
  const { markets } = useMarkets()

  return (
    <nav aria-label="Main" className="relative z-40 flex items-center justify-between px-8 py-4 md:px-28">
      <div className="flex items-center gap-12 md:gap-20">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" priority />
          <span className="text-xl font-bold tracking-tight">Aurax</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          <Link href="/" aria-current="page" className={`${linkClass} text-foreground`}>
            Home
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className={`${linkClass} inline-flex items-center gap-1 data-[state=open]:text-foreground`}>
              Markets
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="dark w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Spot markets</DropdownMenuLabel>
              {markets.map((m) => (
                <DropdownMenuItem key={m.symbol} asChild>
                  <Link href={`/trade/${m.symbol}`} className="flex justify-between">
                    <span className="font-medium">
                      {m.baseAsset}/{m.quoteAsset}
                    </span>
                    <span className="text-xs text-muted-foreground">Trade</span>
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/markets">All markets</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/fees" className={linkClass}>
            Fees
          </Link>
          <Link href="/status" className={linkClass}>
            Status
          </Link>
        </div>
      </div>
      {isPending ? (
        <span className="h-9 w-20 animate-pulse rounded-lg bg-foreground/10" aria-hidden="true" />
      ) : (
        <Link
          href={isAuthenticated ? "/dashboard" : "/login"}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {isAuthenticated ? "Dashboard" : "Sign In"}
        </Link>
      )}
    </nav>
  )
}
