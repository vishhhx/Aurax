"use client"

import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-account"
import { useMarkets } from "@/hooks/use-market-data"

export function HeroActions() {
  const { isAuthenticated } = useAuth()
  const { markets } = useMarkets()
  const trade = markets[0] ? `/trade/${markets[0].symbol}` : "/trade"
  return (
    <div className="flex flex-wrap gap-2">
      {isAuthenticated ? (
        <>
          <Button asChild size="lg">
            <Link href={trade}>
              Start trading
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </>
      ) : (
        <>
          <Button asChild size="lg">
            <Link href="/register">
              Create account
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={trade}>View the terminal</Link>
          </Button>
        </>
      )}
    </div>
  )
}
