"use client"

import Link from "next/link"
import { ArrowRightIcon, LayoutDashboardIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DepositDialog } from "@/components/deposit-dialog"
import { useAppSelector } from "@/hooks/useRedux"
import { selectIsAuthenticated } from "@/store/slices/authSlice"

export function HeroActions() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)

  return isAuthenticated ? (
    <div className="flex flex-wrap gap-3">
      <DepositDialog
        trigger={
          <Button size="lg" className="h-11 px-5">
            Deposit INR
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        }
      />
      <Button asChild size="lg" variant="outline" className="h-11 px-5">
        <Link href="/dashboard">
          <LayoutDashboardIcon data-icon="inline-start" />
          Go to dashboard
        </Link>
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg" className="h-11 px-5">
        <Link href="/register">
          Create free account
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-11 px-5">
        <Link href="/login">Log in</Link>
      </Button>
    </div>
  )
}
